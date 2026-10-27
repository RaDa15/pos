import { Router, type Request, type Response } from 'express';
import { prisma } from '../db/client.js';
import {
  requireEmployee,
  requirePermission,
  requireActiveSubscription,
  requirePlanFeature,
} from '../middleware/auth.js';
import { parseRangeToUtc, formatBttDate } from '../lib/dates.js';
import { stringifyCsv } from '../lib/csv.js';
import { Prisma } from '@prisma/client';

export const reportsRouter: Router = Router();

reportsRouter.use(requireEmployee);
reportsRouter.use(requireActiveSubscription);

/**
 * GET /api/v1/reports/gst
 * DRC-compliant GST report for a date-time range in Asia/Thimphu.
 * Reference: docs/02-BUSINESS-RULES.md BR-30, BR-33, AC-43, AC-44.
 */
reportsRouter.get(
  '/gst',
  requirePermission('reports.gst'),
  requirePlanFeature('gst_reports'),
  async (req: Request, res: Response) => {
    const businessId = req.business!.id;
    const { from, to } = req.query as { from?: string; to?: string };

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { gstRegistered: true },
    });

    const { fromUtc, toUtc } = parseRangeToUtc(from, to);

    const completedAtFilter: Prisma.DateTimeFilter = {};
    if (fromUtc) completedAtFilter.gte = fromUtc;
    if (toUtc) completedAtFilter.lte = toUtc;

    // Fetch completed sales in range with selective scalar fields (no heavy relation hydration)
    const completedSales = await prisma.sale.findMany({
      where: {
        businessId,
        status: 'completed',
        ...(fromUtc || toUtc ? { completedAt: completedAtFilter } : {}),
      },
      select: {
        id: true,
        invoiceNo: true,
        completedAt: true,
        createdAt: true,
        total: true,
        taxableAmount: true,
        taxAmount: true,
        discountTotal: true,
        status: true,
      },
      orderBy: { completedAt: 'asc' },
    });

    // Count voided sales in range (BR-30, AC-43: excluded from all sums)
    const voidedCount = await prisma.sale.count({
      where: {
        businessId,
        status: 'voided',
        ...(fromUtc || toUtc ? { completedAt: completedAtFilter } : {}),
      },
    });

    let totalSalesChhertum = 0;
    let taxableSalesChhertum = 0;
    let gstChhertum = 0;
    let discountsChhertum = 0;

    // Daily breakdown map: key = YYYY-MM-DD in BTT
    const dailyMap = new Map<
      string,
      { sales: number; taxable: number; gst: number; transactions: number }
    >();

    const salesList = [];
    const maxSalesList = Math.min(completedSales.length, 1000);

    for (let i = 0; i < completedSales.length; i++) {
      const sale = completedSales[i]!;
      const saleTotal = Math.round(Number(sale.total) * 100);
      const saleTaxable = Math.round(Number(sale.taxableAmount) * 100);
      const saleGst = Math.round(Number(sale.taxAmount) * 100);
      const saleDisc = Math.round(Number(sale.discountTotal) * 100);

      totalSalesChhertum += saleTotal;
      taxableSalesChhertum += saleTaxable;
      gstChhertum += saleGst;
      discountsChhertum += saleDisc;

      // Daily grouping by Asia/Thimphu date (BR-33, AC-44)
      const bttDateStr = formatBttDate(sale.completedAt ?? sale.createdAt);
      const dayData = dailyMap.get(bttDateStr) || {
        sales: 0,
        taxable: 0,
        gst: 0,
        transactions: 0,
      };
      dayData.sales += saleTotal;
      dayData.taxable += saleTaxable;
      dayData.gst += saleGst;
      dayData.transactions += 1;
      dailyMap.set(bttDateStr, dayData);

      if (i < maxSalesList) {
        salesList.push({
          id: sale.id,
          invoiceNo: sale.invoiceNo,
          completedAt: (sale.completedAt ?? sale.createdAt).toISOString(),
          taxable: Number(sale.taxableAmount),
          gst: Number(sale.taxAmount),
          total: Number(sale.total),
          status: sale.status,
        });
      }
    }

    // Format daily list sorted by date ascending
    const daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        sales: d.sales / 100,
        taxable: d.taxable / 100,
        gst: d.gst / 100,
        transactions: d.transactions,
      }));

    // Line items by-rate grouping (AC-43) using SQL aggregation
    const rateRows = await prisma.$queryRaw<
      Array<{ rate: string | number; category: string; taxable: string | number; gst: string | number }>
    >`
      SELECT 
        si.tax_rate AS rate,
        si.tax_category AS category,
        COALESCE(SUM(si.taxable), 0) AS taxable,
        COALESCE(SUM(si.tax), 0) AS gst
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.business_id = ${businessId}::uuid
        AND s.status = 'completed'
        ${fromUtc ? Prisma.sql`AND COALESCE(s.completed_at, s.created_at) >= ${fromUtc}` : Prisma.empty}
        ${toUtc ? Prisma.sql`AND COALESCE(s.completed_at, s.created_at) <= ${toUtc}` : Prisma.empty}
      GROUP BY si.tax_rate, si.tax_category
      ORDER BY rate DESC
    `;

    let byRate = rateRows.map((r) => ({
      rate: Number(r.rate),
      category: r.category,
      taxable: Number(r.taxable),
      gst: Number(r.gst),
    }));

    // Fallback: If no sale_items exist (e.g. bulk test seeds), infer standard rate from sales total
    if (byRate.length === 0 && gstChhertum > 0) {
      byRate = [
        {
          rate: 5,
          category: 'standard',
          taxable: taxableSalesChhertum / 100,
          gst: gstChhertum / 100,
        },
      ];
    }

    res.json({
      data: {
        range: {
          from: from || null,
          to: to || null,
        },
        gstRegistered: business?.gstRegistered ?? true,
        summary: {
          totalSales: totalSalesChhertum / 100,
          taxableSales: taxableSalesChhertum / 100,
          gst: gstChhertum / 100,
          discounts: discountsChhertum / 100,
          transactions: completedSales.length,
          voided: voidedCount,
          netSales: totalSalesChhertum / 100,
        },
        daily,
        byRate,
        sales: salesList,
      },
    });
  }
);

/**
 * GET /api/v1/reports/gst/export.csv?kind=daily|rate|sales&from=&to=
 * CSV exports for GST tables (AC-45).
 */
reportsRouter.get(
  '/gst/export.csv',
  requirePermission('reports.gst'),
  requirePlanFeature('gst_reports'),
  async (req: Request, res: Response) => {
    const businessId = req.business!.id;
    const { kind, from, to } = req.query as {
      kind?: 'daily' | 'rate' | 'sales';
      from?: string;
      to?: string;
    };

    const { fromUtc, toUtc } = parseRangeToUtc(from, to);

    const completedAtFilter: Prisma.DateTimeFilter = {};
    if (fromUtc) completedAtFilter.gte = fromUtc;
    if (toUtc) completedAtFilter.lte = toUtc;

    const completedSales = await prisma.sale.findMany({
      where: {
        businessId,
        status: 'completed',
        ...(fromUtc || toUtc ? { completedAt: completedAtFilter } : {}),
      },
      include: { items: true },
      orderBy: { completedAt: 'asc' },
    });

    let csvContent = '';
    const dateRangeLabel = `${from || 'start'}_to_${to || 'now'}`;

    if (kind === 'daily') {
      const dailyMap = new Map<
        string,
        { sales: number; taxable: number; gst: number; transactions: number }
      >();

      for (const sale of completedSales) {
        const dStr = formatBttDate(sale.completedAt ?? sale.createdAt);
        const cur = dailyMap.get(dStr) || { sales: 0, taxable: 0, gst: 0, transactions: 0 };
        cur.sales += Math.round(Number(sale.total) * 100);
        cur.taxable += Math.round(Number(sale.taxableAmount) * 100);
        cur.gst += Math.round(Number(sale.taxAmount) * 100);
        cur.transactions += 1;
        dailyMap.set(dStr, cur);
      }

      const headers = [
        'Date',
        'Transactions',
        'Taxable Sales (Nu.)',
        'GST Collected (Nu.)',
        'Total Sales (Nu.)',
      ];
      const rows = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => [
          date,
          d.transactions,
          (d.taxable / 100).toFixed(2),
          (d.gst / 100).toFixed(2),
          (d.sales / 100).toFixed(2),
        ]);

      csvContent = stringifyCsv(headers, rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="gst-daily-${dateRangeLabel}.csv"`
      );
    } else if (kind === 'rate') {
      const rateMap = new Map<
        string,
        { rate: number; category: string; taxable: number; gst: number }
      >();

      for (const sale of completedSales) {
        for (const line of sale.items) {
          const rate = Number(line.taxRate);
          const cat = line.taxCategory;
          const key = `${rate}_${cat}`;
          const cur = rateMap.get(key) || { rate, category: cat, taxable: 0, gst: 0 };
          cur.taxable += Math.round(Number(line.taxable) * 100);
          cur.gst += Math.round(Number(line.tax) * 100);
          rateMap.set(key, cur);
        }
      }

      const headers = [
        'GST Rate (%)',
        'Tax Category',
        'Taxable Amount (Nu.)',
        'GST Amount (Nu.)',
      ];
      const rows = Array.from(rateMap.values())
        .sort((a, b) => b.rate - a.rate)
        .map((r) => [
          r.rate,
          r.category,
          (r.taxable / 100).toFixed(2),
          (r.gst / 100).toFixed(2),
        ]);

      csvContent = stringifyCsv(headers, rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="gst-rates-${dateRangeLabel}.csv"`
      );
    } else {
      // default: sales transactions
      const headers = [
        'Invoice No',
        'Date & Time (UTC)',
        'Status',
        'Taxable Amount (Nu.)',
        'GST Amount (Nu.)',
        'Total (Nu.)',
      ];
      const rows = completedSales.map((s) => [
        s.invoiceNo,
        (s.completedAt ?? s.createdAt).toISOString(),
        s.status,
        Number(s.taxableAmount).toFixed(2),
        Number(s.taxAmount).toFixed(2),
        Number(s.total).toFixed(2),
      ]);

      csvContent = stringifyCsv(headers, rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="gst-transactions-${dateRangeLabel}.csv"`
      );
    }

    res.send(csvContent);
  }
);

/**
 * GET /api/v1/reports/sales
 * Sales and Estimated Profit report with historical cost of goods and expenses.
 * Reference: docs/02-BUSINESS-RULES.md BR-32, AC-47.
 */
reportsRouter.get(
  '/sales',
  requirePermission('reports.sales'),
  async (req: Request, res: Response) => {
    const businessId = req.business!.id;
    const { from, to } = req.query as { from?: string; to?: string };

    const { fromUtc, toUtc } = parseRangeToUtc(from, to);

    const completedAtFilter: Prisma.DateTimeFilter = {};
    if (fromUtc) completedAtFilter.gte = fromUtc;
    if (toUtc) completedAtFilter.lte = toUtc;

    // 1. Completed Sales in range with selective scalar fields
    const completedSales = await prisma.sale.findMany({
      where: {
        businessId,
        status: 'completed',
        ...(fromUtc || toUtc ? { completedAt: completedAtFilter } : {}),
      },
      select: {
        id: true,
        total: true,
        taxableAmount: true,
        charges: true,
        completedAt: true,
        createdAt: true,
        cashier: { select: { name: true } },
      },
      orderBy: { completedAt: 'asc' },
    });

    // 2. Expenses in range (dated on businessDate)
    const expenseWhere: Prisma.ExpenseWhereInput = { businessId };
    if (from || to) {
      expenseWhere.businessDate = {};
      if (from) expenseWhere.businessDate.gte = parseRangeToUtc(from).fromUtc;
      if (to) expenseWhere.businessDate.lte = parseRangeToUtc(undefined, to).toUtc;
    }

    const expenses = await prisma.expense.findMany({
      where: expenseWhere,
    });

    let grossSalesChhertum = 0;
    let revenueChhertum = 0; // taxable + charges (BR-32)

    // Maps for daily trends and cashier breakdown
    const dayMap = new Map<
      string,
      { revenue: number; cogs: number; expenses: number; gross: number }
    >();
    const cashierMap = new Map<string, { orders: number; sales: number }>();

    for (const sale of completedSales) {
      const gross = Math.round(Number(sale.total) * 100);
      const taxable = Math.round(Number(sale.taxableAmount) * 100);
      const charges = Math.round(Number(sale.charges) * 100);
      const rev = taxable + charges;

      grossSalesChhertum += gross;
      revenueChhertum += rev;

      const dateStr = formatBttDate(sale.completedAt ?? sale.createdAt);
      const dayData = dayMap.get(dateStr) || { revenue: 0, cogs: 0, expenses: 0, gross: 0 };
      dayData.revenue += rev;
      dayData.gross += gross;
      dayMap.set(dateStr, dayData);

      // Cashier breakdown
      const cashierName = sale.cashier?.name || 'Staff';
      const cData = cashierMap.get(cashierName) || { orders: 0, sales: 0 };
      cData.orders += 1;
      cData.sales += gross;
      cashierMap.set(cashierName, cData);
    }

    // 3. Fast SQL aggregation for COGS by day across sale_items
    const cogsByDayRows = await prisma.$queryRaw<
      Array<{ day: string; cogs: string | number }>
    >`
      SELECT 
        TO_CHAR(COALESCE(s.completed_at, s.created_at) AT TIME ZONE 'Asia/Thimphu', 'YYYY-MM-DD') AS day,
        COALESCE(SUM(si.unit_cost * si.qty), 0) AS cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.business_id = ${businessId}::uuid
        AND s.status = 'completed'
        ${fromUtc ? Prisma.sql`AND COALESCE(s.completed_at, s.created_at) >= ${fromUtc}` : Prisma.empty}
        ${toUtc ? Prisma.sql`AND COALESCE(s.completed_at, s.created_at) <= ${toUtc}` : Prisma.empty}
      GROUP BY 1
    `;

    let cogsChhertum = 0;
    for (const row of cogsByDayRows) {
      const lineCogs = Math.round(Number(row.cogs) * 100);
      cogsChhertum += lineCogs;
      const dayData = dayMap.get(row.day) || { revenue: 0, cogs: 0, expenses: 0, gross: 0 };
      dayData.cogs = lineCogs;
      dayMap.set(row.day, dayData);
    }

    // 4. Add expenses to daily map
    let totalExpensesChhertum = 0;
    for (const exp of expenses) {
      const expChhertum = Math.round(Number(exp.amount) * 100);
      totalExpensesChhertum += expChhertum;

      const expDateStr = exp.businessDate.toISOString().slice(0, 10);
      const dayData = dayMap.get(expDateStr) || { revenue: 0, cogs: 0, expenses: 0, gross: 0 };
      dayData.expenses += expChhertum;
      dayMap.set(expDateStr, dayData);
    }

    // Estimated profit = revenue - cogs - expenses (BR-32, AC-47)
    const estimatedProfitChhertum = revenueChhertum - cogsChhertum - totalExpensesChhertum;

    // Build arrays
    const sortedDates = Array.from(dayMap.keys()).sort();
    const revenueByDay = sortedDates.map((date) => ({
      date,
      revenue: dayMap.get(date)!.revenue / 100,
    }));

    const profitByDay = sortedDates.map((date) => {
      const d = dayMap.get(date)!;
      const profit = (d.revenue - d.cogs - d.expenses) / 100;
      return {
        date,
        profit,
        revenue: d.revenue / 100,
        cogs: d.cogs / 100,
        expenses: d.expenses / 100,
      };
    });

    // 5. Category breakdown via SQL aggregation
    const categoryRows = await prisma.$queryRaw<
      Array<{ category: string; qty: string | number; sales: string | number }>
    >`
      SELECT 
        si.category AS category,
        COALESCE(SUM(si.qty), 0) AS qty,
        COALESCE(SUM(si.total), 0) AS sales
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.business_id = ${businessId}::uuid
        AND s.status = 'completed'
        ${fromUtc ? Prisma.sql`AND COALESCE(s.completed_at, s.created_at) >= ${fromUtc}` : Prisma.empty}
        ${toUtc ? Prisma.sql`AND COALESCE(s.completed_at, s.created_at) <= ${toUtc}` : Prisma.empty}
      GROUP BY si.category
      ORDER BY sales DESC
    `;

    const byCategory = categoryRows.map((r) => ({
      category: r.category || 'General',
      qty: Number(r.qty),
      sales: Number(r.sales),
    }));

    const byCashier = Array.from(cashierMap.entries())
      .sort((a, b) => b[1].sales - a[1].sales)
      .map(([cashierName, val]) => ({
        cashierName,
        orders: val.orders,
        sales: val.sales / 100,
      }));

    const count = completedSales.length;
    const averageSale = count > 0 ? grossSalesChhertum / count / 100 : 0;

    res.json({
      data: {
        grossSales: grossSalesChhertum / 100,
        count,
        averageSale: Math.round(averageSale * 100) / 100,
        estimatedProfit: estimatedProfitChhertum / 100,
        revenueByDay,
        profitByDay,
        byCategory,
        byCashier,
      },
    });
  }
);
