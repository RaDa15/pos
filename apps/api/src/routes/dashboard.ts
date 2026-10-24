import { Router, type Request, type Response } from 'express';
import { prisma } from '../db/client.js';
import { requireEmployee, requirePermission } from '../middleware/auth.js';
import { getBttDate } from '../lib/dates.js';
import { EmployeeRole } from '@prisma/client';

export const dashboardRouter: Router = Router();

dashboardRouter.use(requireEmployee);

type DashboardLens = 'full' | 'finance' | 'sales' | 'inventory' | 'floor';

function getLensForRole(role: EmployeeRole): DashboardLens {
  switch (role) {
    case EmployeeRole.admin:
    case EmployeeRole.manager:
      return 'full';
    case EmployeeRole.accountant:
      return 'finance';
    case EmployeeRole.cashier:
      return 'sales';
    case EmployeeRole.inventory_officer:
    case EmployeeRole.storekeeper:
      return 'inventory';
    case EmployeeRole.waiter:
    case EmployeeRole.kitchen_staff:
      return 'floor';
    default:
      return 'sales';
  }
}

/**
 * GET /api/v1/dashboard
 * Role-based dashboard returning strictly the caller's lens data.
 * Reference: docs/05-SECURITY-ACCESS.md §4, docs/07-API-SPEC.md §3.5, AC-15, AC-16.
 */
dashboardRouter.get(
  '/',
  requirePermission('dashboard.view'),
  async (req: Request, res: Response) => {
    const businessId = req.business!.id;
    const lens = req.employee?.dashboardLens ?? (req.employee ? getLensForRole(req.employee.role as EmployeeRole) : 'sales');
    const isRestaurant = req.business?.type === 'restaurant';

    const { businessDateStr, businessDate } = getBttDate();

    // 1. Common / Conditional Queries based on lens
    const needsFinancials = lens === 'full' || lens === 'finance';
    const needsSalesCount = lens === 'full' || lens === 'finance' || lens === 'sales';
    const needsInventory = lens === 'full' || lens === 'inventory' || lens === 'sales';
    const needsRestaurant = isRestaurant && (lens === 'full' || lens === 'floor' || lens === 'inventory');
    const needsCharts = lens === 'full' || lens === 'finance';
    const needsRecentSales = lens === 'full' || lens === 'finance' || lens === 'sales';

    // Fetch Today's Completed Sales (BR-30, BR-31, BR-32, BR-33)
    const todayCompletedSales = needsSalesCount
      ? await prisma.sale.findMany({
          where: {
            businessId,
            businessDate,
            status: 'completed',
          },
          include: {
            items: true,
            payments: {
              where: { status: 'completed' },
            },
            cashier: {
              select: { name: true },
            },
          },
          orderBy: { completedAt: 'desc' },
        })
      : [];

    // Calculate Today's Sales KPIs
    let todaySales = 0;
    let todayOrders = 0;
    let todayGst = 0;
    let todayRevenueChhertum = 0;
    let todayCogsChhertum = 0;

    if (needsSalesCount) {
      todayOrders = todayCompletedSales.length;
      for (const sale of todayCompletedSales) {
        const saleTotal = Number(sale.total);
        todaySales += saleTotal;
        todayGst += Number(sale.taxAmount);

        // Revenue = taxable_amount + charges (GST excluded) per BR-32
        todayRevenueChhertum += Math.round(Number(sale.taxableAmount) * 100) + Math.round(Number(sale.charges) * 100);

        for (const line of sale.items) {
          const unitCost = Number(line.unitCost);
          todayCogsChhertum += Math.round(unitCost * line.qty * 100);
        }
      }
    }

    // Today's Expenses (BR-32, BR-39)
    let todayExpenses = 0;
    if (needsFinancials) {
      const expenses = await prisma.expense.findMany({
        where: {
          businessId,
          businessDate,
        },
      });
      todayExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    }

    // Profit = Revenue - COGS - Expenses (BR-32)
    const todayProfit = needsFinancials
      ? (todayRevenueChhertum - todayCogsChhertum - Math.round(todayExpenses * 100)) / 100
      : undefined;

    // Counts (products, customers, lowStock, outOfStock, pendingOrders)
    let totalProducts = 0;
    let totalCustomers = 0;
    let pendingOrders = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    if (lens === 'full' || lens === 'inventory') {
      totalProducts = await prisma.product.count({
        where: { businessId, active: true },
      });
    }

    if (lens === 'full' || lens === 'sales' || lens === 'inventory' || lens === 'finance') {
      totalCustomers = await prisma.customer.count({
        where: { businessId, active: true },
      });
    }

    if (isRestaurant && (lens === 'full' || lens === 'sales' || lens === 'floor' || lens === 'finance')) {
      pendingOrders = await prisma.kitchenOrder.count({
        where: {
          businessId,
          status: { in: ['new', 'accepted', 'preparing', 'ready'] },
        },
      });
    }

    // Low stock & out of stock products (BR-26)
    const lowStockItems: Array<{
      id: string;
      name: string;
      barcode: string;
      stock: number;
      minStock: number;
    }> = [];

    if (needsInventory) {
      const trackedProducts = await prisma.product.findMany({
        where: {
          businessId,
          active: true,
          trackStock: true,
        },
        select: {
          id: true,
          name: true,
          barcode: true,
          stock: true,
          minStock: true,
        },
      });

      for (const p of trackedProducts) {
        if (p.stock <= 0) {
          outOfStockCount++;
        }
        if (p.minStock > 0 && p.stock <= p.minStock) {
          lowStockCount++;
          if (lowStockItems.length < 8) {
            lowStockItems.push(p);
          }
        }
      }
    }

    // Grocery snapshot (Inventory value, fast moving)
    let grocerySnapshot: {
      inventoryValue: number;
      fastMovingToday: number;
      recentPurchases: number;
    } | undefined;

    if (!isRestaurant && (lens === 'full' || lens === 'inventory')) {
      const allTracked = await prisma.product.findMany({
        where: { businessId, active: true, trackStock: true },
        select: { stock: true, purchasePrice: true },
      });

      let invValueChhertum = 0;
      for (const p of allTracked) {
        if (p.stock > 0) {
          invValueChhertum += Math.round(Number(p.purchasePrice) * p.stock * 100);
        }
      }

      grocerySnapshot = {
        inventoryValue: invValueChhertum / 100,
        fastMovingToday: todayOrders,
        recentPurchases: 0,
      };
    }

    // Restaurant floor snapshot (Active tables, pending kitchen, dine-in, takeaway)
    let restaurantSnapshot: {
      activeTables: number;
      pendingKitchen: number;
      dineIn: number;
      takeaway: number;
    } | undefined;

    if (isRestaurant && needsRestaurant) {
      const openKots = await prisma.kitchenOrder.findMany({
        where: {
          businessId,
          status: { in: ['new', 'accepted', 'preparing', 'ready'] },
        },
        select: { tableNo: true, orderType: true },
      });

      const uniqueTables = new Set(
        openKots.filter((k) => k.tableNo).map((k) => k.tableNo)
      );

      const dineInCount = openKots.filter((k) => k.orderType === 'dine_in').length;
      const takeawayCount = openKots.filter((k) => k.orderType === 'takeaway').length;

      restaurantSnapshot = {
        activeTables: uniqueTables.size,
        pendingKitchen: openKots.length,
        dineIn: dineInCount,
        takeaway: takeawayCount,
      };
    }

    // Open kitchen tickets for floor lens / restaurant full lens (AC-16)
    let openKitchenTickets: Array<{
      id: string;
      orderNo: string;
      orderType: string;
      tableNo: string | null;
      status: string;
      note: string | null;
      minutesAgo: number;
      itemCount: number;
      items: string[];
    }> = [];

    if (isRestaurant && (lens === 'full' || lens === 'floor' || lens === 'sales')) {
      const tickets = await prisma.kitchenOrder.findMany({
        where: {
          businessId,
          status: { in: ['new', 'accepted', 'preparing', 'ready'] },
        },
        include: {
          items: {
            include: { product: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const now = Date.now();
      openKitchenTickets = tickets.map((t) => ({
        id: t.id,
        orderNo: t.orderNo,
        orderType: t.orderType,
        tableNo: t.tableNo,
        status: t.status,
        note: t.note,
        minutesAgo: Math.max(0, Math.floor((now - t.createdAt.getTime()) / 60000)),
        itemCount: t.items.reduce((s, i) => s + i.qty, 0),
        items: t.items.map((i) => `${i.qty}× ${i.product?.name || 'Dish'}`),
      }));
    }

    // Sales Last 7 Days (Charts)
    let salesLast7Days: Array<{ date: string; sales: number; orders: number }> = [];
    if (needsCharts) {
      // Last 7 distinct business dates up to today
      const pastSales = await prisma.sale.findMany({
        where: {
          businessId,
          status: 'completed',
        },
        select: {
          businessDate: true,
          total: true,
        },
        orderBy: { businessDate: 'desc' },
      });

      const dayMap = new Map<string, { sales: number; orders: number }>();
      for (const s of pastSales) {
        const dStr = s.businessDate.toISOString().slice(0, 10);
        const existing = dayMap.get(dStr) || { sales: 0, orders: 0 };
        existing.sales += Number(s.total);
        existing.orders += 1;
        dayMap.set(dStr, existing);
      }

      // Collect last 7 recorded days (or last 7 consecutive days)
      const dates = Array.from(dayMap.keys()).slice(0, 7).reverse();
      salesLast7Days = dates.map((d) => ({
        date: d,
        sales: Math.round(dayMap.get(d)!.sales * 100) / 100,
        orders: dayMap.get(d)!.orders,
      }));
    }

    // Payment Mix Today (Completed payments only per BR-31)
    let paymentMixToday: Array<{ method: string; amount: number; count: number }> = [];
    if (needsCharts) {
      const methodMap = new Map<string, { amount: number; count: number }>();
      for (const sale of todayCompletedSales) {
        for (const p of sale.payments) {
          const m = p.method;
          const amt = Number(p.amount);
          const cur = methodMap.get(m) || { amount: 0, count: 0 };
          cur.amount += amt;
          cur.count += 1;
          methodMap.set(m, cur);
        }
      }

      paymentMixToday = Array.from(methodMap.entries()).map(([method, val]) => ({
        method,
        amount: Math.round(val.amount * 100) / 100,
        count: val.count,
      }));
    }

    // Top Products Sold Today
    let topProducts: Array<{ name: string; qty: number; amount: number }> = [];
    if (lens === 'full' || lens === 'finance') {
      const prodMap = new Map<string, { name: string; qty: number; amount: number }>();
      for (const sale of todayCompletedSales) {
        for (const line of sale.items) {
          const cur = prodMap.get(line.productId) || {
            name: line.name,
            qty: 0,
            amount: 0,
          };
          cur.qty += line.qty;
          cur.amount += Number(line.total);
          prodMap.set(line.productId, cur);
        }
      }

      topProducts = Array.from(prodMap.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5)
        .map((p) => ({
          ...p,
          amount: Math.round(p.amount * 100) / 100,
        }));
    }

    // Recent Invoices (6 sales)
    let recentSales: Array<{
      id: string;
      invoiceNo: string;
      total: number;
      paymentSummary: string;
      cashierName: string;
      completedAt: string;
    }> = [];

    if (needsRecentSales) {
      const topSales = todayCompletedSales.slice(0, 6);
      recentSales = topSales.map((s) => ({
        id: s.id,
        invoiceNo: s.invoiceNo,
        total: Number(s.total),
        paymentSummary: s.payments.map((p) => p.method).join(', ') || 'Paid',
        cashierName: s.cashier?.name || 'Staff',
        completedAt: (s.completedAt ?? s.createdAt).toISOString(),
      }));
    }

    // Construct response tailored strictly to caller's lens
    // Reference: AC-15: Cashier's response has no `profit`, `gst` or `expenses` fields.
    const responseData: Record<string, unknown> = {
      lens,
      businessType: req.business?.type,
      businessDate: businessDateStr,
    };

    if (lens === 'full') {
      responseData.today = {
        sales: Math.round(todaySales * 100) / 100,
        orders: todayOrders,
        profit: todayProfit,
        gst: Math.round(todayGst * 100) / 100,
        expenses: Math.round(todayExpenses * 100) / 100,
      };
      responseData.counts = {
        products: totalProducts,
        customers: totalCustomers,
        pendingOrders,
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
      };
      responseData.lowStockItems = lowStockItems;
      if (isRestaurant) {
        responseData.restaurant = restaurantSnapshot;
        responseData.openKitchenTickets = openKitchenTickets;
      } else {
        responseData.grocery = grocerySnapshot;
      }
      responseData.salesLast7Days = salesLast7Days;
      responseData.paymentMixToday = paymentMixToday;
      responseData.topProducts = topProducts;
      responseData.recentSales = recentSales;
    } else if (lens === 'finance') {
      responseData.today = {
        sales: Math.round(todaySales * 100) / 100,
        orders: todayOrders,
        profit: todayProfit,
        gst: Math.round(todayGst * 100) / 100,
        expenses: Math.round(todayExpenses * 100) / 100,
      };
      responseData.counts = {
        customers: totalCustomers,
        pendingOrders,
      };
      responseData.salesLast7Days = salesLast7Days;
      responseData.paymentMixToday = paymentMixToday;
      responseData.topProducts = topProducts;
      responseData.recentSales = recentSales;
    } else if (lens === 'sales') {
      // Cashier lens: strictly NO profit, gst, or expenses
      responseData.today = {
        sales: Math.round(todaySales * 100) / 100,
        orders: todayOrders,
      };
      responseData.counts = {
        customers: totalCustomers,
        pendingOrders,
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
      };
      responseData.lowStockItems = lowStockItems;
      responseData.recentSales = recentSales;
      if (isRestaurant) {
        responseData.openKitchenTickets = openKitchenTickets;
      }
    } else if (lens === 'inventory') {
      responseData.counts = {
        products: totalProducts,
        customers: totalCustomers,
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
      };
      responseData.lowStockItems = lowStockItems;
      if (isRestaurant) {
        responseData.restaurant = restaurantSnapshot;
      } else {
        responseData.grocery = grocerySnapshot;
      }
    } else if (lens === 'floor') {
      // Waiter / Kitchen staff: restaurant floor & tickets only
      responseData.restaurant = restaurantSnapshot;
      responseData.openKitchenTickets = openKitchenTickets;
    }

    res.json({ data: responseData });
  }
);
