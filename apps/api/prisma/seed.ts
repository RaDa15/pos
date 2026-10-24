import argon2 from 'argon2';
import {
  PrismaClient,
  BusinessType,
  PlanCode,
  SubscriptionStatus,
  SubscriptionEventType,
  EmployeeRole,
  TaxMode,
  TaxCategory,
  ProductUnit,
  MovementType,
  CustomerType,
  ExpenseCategory,
  ExpensePaymentMethod,
  CounterName,
  SaleStatus,
  PaymentStatus,
  PaymentKind,
  PaymentMethod,
  OrderType,
} from '@prisma/client';
import { env } from '../src/config/env.js';
import { computeSale, nuToChhertum, chhertumToNu } from '@pos/shared';
import { nextNumber } from '../src/lib/counters.js';

const prisma = new PrismaClient();

// Deterministic seed barcodes
function makeBarcode(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(8, '0')}`;
}

export async function seed() {
  console.log('--- Starting Database Seeding ---');

  // 1. Platform Admin (Always created or updated)
  const existingAdmin = await prisma.platformAdmin.findUnique({
    where: { email: env.PLATFORM_ADMIN_EMAIL },
  });

  if (!existingAdmin) {
    const adminPasswordHash = await argon2.hash(env.PLATFORM_ADMIN_INITIAL_PASSWORD, {
      type: argon2.argon2id,
    });

    await prisma.platformAdmin.create({
      data: {
        email: env.PLATFORM_ADMIN_EMAIL,
        name: 'Platform Administrator',
        passwordHash: adminPasswordHash,
        mustChangePassword: true,
        active: true,
      },
    });
    console.log(`✓ Seeded Platform Admin: ${env.PLATFORM_ADMIN_EMAIL}`);
  } else {
    console.log(`ℹ Platform Admin already exists: ${env.PLATFORM_ADMIN_EMAIL}`);
  }

  // 2. AC-66 Check: If production, refuse to seed demo businesses
  if (env.NODE_ENV === 'production') {
    if (env.SEED_DEMO_BUSINESSES) {
      console.warn('⚠ AC-66: SEED_DEMO_BUSINESSES is true, but NODE_ENV=production. Refusing demo seeding in production.');
    }
    return;
  }

  if (!env.SEED_DEMO_BUSINESSES) {
    console.log('ℹ SEED_DEMO_BUSINESSES is false. Skipping demo business seeding.');
    return;
  }

  console.log('Seeding 4 demo businesses for local/staging demonstration...');

  const demoPasswordHash = await argon2.hash(env.SEED_DEMO_PASSWORD, {
    type: argon2.argon2id,
  });

  const demoBusinesses = [
    {
      code: 'BIZ-PEMA1',
      name: 'Pema Store',
      type: BusinessType.grocery,
      ownerName: 'Pema Yangzom',
      phone: '+975 17123450',
      email: 'pemastore.bt@gmail.com',
      address: 'Changzamtok, Thimphu',
      gstNo: 'GST-100223344',
    },
    {
      code: 'BIZ-TEST1',
      name: 'Test Restaurant',
      type: BusinessType.restaurant,
      ownerName: 'Sonam Dorji',
      phone: '+975 17998877',
      email: 'testrestaurant.bt@gmail.com',
      address: 'Norzin Lam, Thimphu',
      gstNo: 'GST-100556677',
    },
    {
      code: 'BIZ-NORB1',
      name: 'Norbu General Store',
      type: BusinessType.grocery,
      ownerName: 'Norbu Wangdi',
      phone: '+975 17887766',
      email: 'norbugeneralstore.bt@gmail.com',
      address: 'Olakha, Thimphu',
      gstNo: 'GST-100998877',
    },
    {
      code: 'BIZ-MENJ1',
      name: 'Menjong Kitchen',
      type: BusinessType.restaurant,
      ownerName: 'Deki Choden',
      phone: '+975 17776655',
      email: 'menjongkitchen.bt@gmail.com',
      address: 'Chubachu, Thimphu',
      gstNo: 'GST-100887766',
    },
  ];

async function cleanDemoBusiness(businessId: string) {
  await prisma.auditLog.deleteMany({ where: { businessId } });
  await prisma.heldOrder.deleteMany({ where: { businessId } });
  await prisma.idempotencyKey.deleteMany({ where: { businessId } });
  // Break mutual FK between Sale and KitchenOrder before deletion
  await prisma.sale.updateMany({ where: { businessId }, data: { kitchenOrderId: null } });
  await prisma.kitchenOrder.updateMany({ where: { businessId }, data: { saleId: null } });
  await prisma.kitchenOrderItem.deleteMany({ where: { businessId } });
  await prisma.saleItem.deleteMany({ where: { businessId } });
  await prisma.payment.deleteMany({ where: { businessId } });
  await prisma.sale.deleteMany({ where: { businessId } });
  await prisma.kitchenOrder.deleteMany({ where: { businessId } });
  await prisma.purchaseItem.deleteMany({ where: { businessId } });
  await prisma.purchase.deleteMany({ where: { businessId } });
  await prisma.stockMovement.deleteMany({ where: { businessId } });
  await prisma.expense.deleteMany({ where: { businessId } });
  await prisma.auditLog.deleteMany({ where: { businessId } });
  await prisma.counter.deleteMany({ where: { businessId } });
  await prisma.customerTypeDiscount.deleteMany({ where: { businessId } });
  await prisma.customer.deleteMany({ where: { businessId } });
  await prisma.product.deleteMany({ where: { businessId } });
  await prisma.supplier.deleteMany({ where: { businessId } });
  await prisma.employee.deleteMany({ where: { businessId } });
  await prisma.taxRate.deleteMany({ where: { businessId } });
  await prisma.subscriptionPayment.deleteMany({ where: { businessId } });
  await prisma.subscriptionEvent.deleteMany({ where: { businessId } });
  await prisma.subscription.deleteMany({ where: { businessId } });
  await prisma.business.delete({ where: { id: businessId } });
}

  for (const demo of demoBusinesses) {
    const nameKey = demo.name.toLowerCase().trim();
    let biz = await prisma.business.findUnique({
      where: { nameKey },
    });

    if (biz) {
      if (biz.isDemo) {
        console.log(`ℹ Re-seeding demo business "${demo.name}"...`);
        await cleanDemoBusiness(biz.id);
      } else {
        console.log(`ℹ Business "${demo.name}" already exists and is not demo. Skipping.`);
        continue;
      }
    }

    biz = await prisma.business.create({
      data: {
        businessCode: demo.code,
        name: demo.name,
        nameKey,
        type: demo.type,
        ownerName: demo.ownerName,
        phone: demo.phone,
        email: demo.email,
        address: demo.address,
        gstNo: demo.gstNo,
        gstRegistered: true,
        passwordHash: demoPasswordHash,
        isDemo: true,
      },
    });

    const bizId = biz.id;

    // Subscription: Professional plan active for 30 days
    const startedAt = new Date(Date.now() - 60 * 86400000);
    const expiresAt = new Date(Date.now() + 30 * 86400000);

    await prisma.subscription.create({
      data: {
        businessId: bizId,
        plan: PlanCode.professional,
        status: SubscriptionStatus.active,
        startedAt,
        expiresAt,
      },
    });

    await prisma.subscriptionEvent.createMany({
      data: [
        {
          businessId: bizId,
          event: SubscriptionEventType.registered,
          plan: PlanCode.professional,
          amount: 2200,
          detail: 'Subscribed to Professional Plan',
          createdAt: startedAt,
        },
        {
          businessId: bizId,
          event: SubscriptionEventType.extended,
          plan: PlanCode.professional,
          amount: 2200,
          detail: 'Renewed for 30 days',
          createdAt: new Date(Date.now() - 30 * 86400000),
        },
      ],
    });

    // Tax Rates: Standard (5%), Zero-Rated (0%), Exempt (0%)
    const standardTax = await prisma.taxRate.create({
      data: {
        businessId: bizId,
        name: 'GST Standard',
        rate: 5.0,
        mode: TaxMode.exclusive,
        category: TaxCategory.standard,
        effectiveDate: new Date(),
        isDefault: true,
      },
    });

    await prisma.taxRate.create({
      data: {
        businessId: bizId,
        name: 'GST Zero-rated',
        rate: 0.0,
        mode: TaxMode.exclusive,
        category: TaxCategory.zero_rated,
        effectiveDate: new Date(),
        isDefault: false,
      },
    });

    const exemptTax = await prisma.taxRate.create({
      data: {
        businessId: bizId,
        name: 'GST Exempt',
        rate: 0.0,
        mode: TaxMode.exclusive,
        category: TaxCategory.exempt,
        effectiveDate: new Date(),
        isDefault: false,
      },
    });

    // 8 Employees (one per role)
    const employeesData = [
      { username: 'admin', role: EmployeeRole.admin, name: demo.ownerName },
      { username: 'manager1', role: EmployeeRole.manager, name: 'Sample Manager' },
      { username: 'cashier1', role: EmployeeRole.cashier, name: 'Sample Cashier' },
      { username: 'accountant1', role: EmployeeRole.accountant, name: 'Sample Accountant' },
      { username: 'inventoryofficer1', role: EmployeeRole.inventory_officer, name: 'Sample Inventory Officer' },
      { username: 'storekeeper1', role: EmployeeRole.storekeeper, name: 'Sample Storekeeper' },
      { username: 'waiter1', role: EmployeeRole.waiter, name: 'Sample Waiter' },
      { username: 'kitchenstaff1', role: EmployeeRole.kitchen_staff, name: 'Sample Kitchen Staff' },
    ];

    let adminEmployeeId = '';
    for (const emp of employeesData) {
      const createdEmp = await prisma.employee.create({
        data: {
          businessId: bizId,
          username: emp.username,
          usernameKey: emp.username.toLowerCase(),
          name: emp.name,
          role: emp.role,
          passwordHash: demoPasswordHash,
          active: true,
        },
      });
      if (emp.role === EmployeeRole.admin) {
        adminEmployeeId = createdEmp.id;
      }
    }

    // Suppliers
    const suppliersData =
      demo.type === BusinessType.grocery
        ? [
            { name: 'Bhutan Food Distributors', phone: '+975 2 323210', email: 'sales@demofood.bt', address: 'Olakha, Thimphu', openingPaid: 45000, openingOutstanding: 12000 },
            { name: 'Druk Wholesale Supply', phone: '+975 17112299', email: 'orders@drukwholesale.bt', address: 'Babesa, Thimphu', openingPaid: 32000, openingOutstanding: 8500 },
            { name: 'Thimphu Beverage Traders', phone: '+975 17667788', email: 'info@thimphubeverage.bt', address: 'Changzamtok, Thimphu', openingPaid: 18000, openingOutstanding: 0 },
          ]
        : [
            { name: 'Bhutan Fresh Foods', phone: '+975 17334455', email: 'orders@bhutanfresh.bt', address: 'Olakha, Thimphu', openingPaid: 28000, openingOutstanding: 5400 },
            { name: 'Druk Beverage Supply', phone: '+975 17778899', email: 'sales@drukbeverage.bt', address: 'Babesa, Thimphu', openingPaid: 19500, openingOutstanding: 2200 },
            { name: 'Local Produce Cooperative', phone: '+975 17221100', email: 'produce@localcoop.bt', address: 'Thimphu', openingPaid: 14000, openingOutstanding: 0 },
          ];

    for (const sup of suppliersData) {
      await prisma.supplier.create({
        data: {
          businessId: bizId,
          name: sup.name,
          phone: sup.phone,
          email: sup.email,
          address: sup.address,
          openingPaid: sup.openingPaid,
          openingOutstanding: sup.openingOutstanding,
        },
      });
    }

    // Products (BR-09: plate items untracked; 02 §8: rice, oil, salt use Exempt rate)
    let productItems: Array<{
      name: string;
      category: string;
      purchasePrice: number;
      sellPrice: number;
      unit: ProductUnit;
      stock: number;
      minStock: number;
      exempt?: boolean;
    }> = [];

    if (demo.type === BusinessType.grocery) {
      productItems = [
        { name: 'Basmati Rice 5kg', category: 'Staples', purchasePrice: 420, sellPrice: 480, unit: ProductUnit.box, stock: 40, minStock: 10, exempt: true },
        { name: 'Red Rice 5kg (local)', category: 'Staples', purchasePrice: 380, sellPrice: 440, unit: ProductUnit.box, stock: 30, minStock: 8, exempt: true },
        { name: 'Mustard Oil 1L', category: 'Cooking Oil', purchasePrice: 180, sellPrice: 210, unit: ProductUnit.l, stock: 60, minStock: 15, exempt: true },
        { name: 'Sunflower Oil 1L', category: 'Cooking Oil', purchasePrice: 165, sellPrice: 195, unit: ProductUnit.l, stock: 55, minStock: 15, exempt: true },
        { name: 'Sugar 1kg', category: 'Staples', purchasePrice: 55, sellPrice: 68, unit: ProductUnit.kg, stock: 100, minStock: 20 },
        { name: 'Iodised Salt 1kg', category: 'Staples', purchasePrice: 18, sellPrice: 25, unit: ProductUnit.kg, stock: 90, minStock: 20, exempt: true },
        { name: 'Red Lentils (Masoor Dal) 1kg', category: 'Staples', purchasePrice: 95, sellPrice: 120, unit: ProductUnit.kg, stock: 70, minStock: 15 },
        { name: 'Milk Powder 400g', category: 'Dairy', purchasePrice: 260, sellPrice: 310, unit: ProductUnit.box, stock: 35, minStock: 10 },
        { name: 'Fresh Datse (Cheese) 250g', category: 'Dairy', purchasePrice: 90, sellPrice: 120, unit: ProductUnit.pc, stock: 30, minStock: 8 },
        { name: 'Farm Eggs (tray of 30)', category: 'Dairy & Eggs', purchasePrice: 260, sellPrice: 300, unit: ProductUnit.box, stock: 25, minStock: 8 },
        { name: 'Marie Biscuits (pack)', category: 'Snacks', purchasePrice: 20, sellPrice: 30, unit: ProductUnit.pc, stock: 150, minStock: 30 },
        { name: 'Potato Chips (large)', category: 'Snacks', purchasePrice: 45, sellPrice: 65, unit: ProductUnit.pc, stock: 80, minStock: 20 },
        { name: 'Bottled Water 1L', category: 'Beverages', purchasePrice: 12, sellPrice: 20, unit: ProductUnit.pc, stock: 200, minStock: 40 },
        { name: 'Coca-Cola 600ml', category: 'Beverages', purchasePrice: 25, sellPrice: 35, unit: ProductUnit.pc, stock: 120, minStock: 30 },
        { name: 'Red Label Tea 250g', category: 'Beverages', purchasePrice: 110, sellPrice: 135, unit: ProductUnit.box, stock: 40, minStock: 10 },
        { name: 'Fresh Potatoes', category: 'Vegetables', purchasePrice: 25, sellPrice: 35, unit: ProductUnit.kg, stock: 80, minStock: 20 },
        { name: 'Onions', category: 'Vegetables', purchasePrice: 30, sellPrice: 42, unit: ProductUnit.kg, stock: 70, minStock: 20 },
        { name: 'Detergent Powder 1kg', category: 'Household', purchasePrice: 140, sellPrice: 170, unit: ProductUnit.kg, stock: 45, minStock: 10 },
        { name: 'Dish Wash Bar', category: 'Household', purchasePrice: 15, sellPrice: 22, unit: ProductUnit.pc, stock: 100, minStock: 20 },
        { name: 'Colgate Toothpaste 150g', category: 'Personal Care', purchasePrice: 60, sellPrice: 80, unit: ProductUnit.pc, stock: 60, minStock: 15 },
      ];
    } else {
      productItems = [
        { name: 'Ema Datshi', category: 'Main Course', purchasePrice: 80, sellPrice: 180, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Kewa Datshi (Potato & Cheese)', category: 'Main Course', purchasePrice: 70, sellPrice: 170, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Shamu Datshi (Mushroom & Cheese)', category: 'Main Course', purchasePrice: 85, sellPrice: 190, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Phaksha Paa (Pork with Radish)', category: 'Main Course', purchasePrice: 130, sellPrice: 260, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Chicken Curry', category: 'Main Course', purchasePrice: 120, sellPrice: 250, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Red Rice (bowl)', category: 'Sides', purchasePrice: 20, sellPrice: 60, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Pork Momos (plate of 8)', category: 'Momos', purchasePrice: 90, sellPrice: 220, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Veg Momos (plate of 8)', category: 'Momos', purchasePrice: 70, sellPrice: 190, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Chicken Momos (plate of 8)', category: 'Momos', purchasePrice: 85, sellPrice: 210, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Fried Rice with Egg', category: 'Rice & Noodles', purchasePrice: 80, sellPrice: 200, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Chow Mein (Chicken)', category: 'Rice & Noodles', purchasePrice: 90, sellPrice: 210, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Thukpa (Noodle Soup)', category: 'Rice & Noodles', purchasePrice: 60, sellPrice: 160, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Suja (Butter Tea)', category: 'Beverages', purchasePrice: 15, sellPrice: 50, unit: ProductUnit.pc, stock: 0, minStock: 0 },
        { name: 'Ngaja (Milk Tea)', category: 'Beverages', purchasePrice: 12, sellPrice: 40, unit: ProductUnit.pc, stock: 0, minStock: 0 },
        { name: 'Fresh Lime Soda', category: 'Beverages', purchasePrice: 20, sellPrice: 70, unit: ProductUnit.pc, stock: 0, minStock: 0 },
        { name: 'Mineral Water 600ml', category: 'Beverages', purchasePrice: 15, sellPrice: 30, unit: ProductUnit.pc, stock: 60, minStock: 15 },
        { name: 'Coca-Cola 300ml', category: 'Beverages', purchasePrice: 20, sellPrice: 40, unit: ProductUnit.pc, stock: 60, minStock: 15 },
        { name: 'Zow Shungo (Rice & Vegetable Mix)', category: 'Sides', purchasePrice: 35, sellPrice: 90, unit: ProductUnit.plate, stock: 0, minStock: 0 },
        { name: 'Khapse (Fried Pastry, 6pc)', category: 'Desserts', purchasePrice: 30, sellPrice: 80, unit: ProductUnit.plate, stock: 0, minStock: 0 },
      ];
    }

    let pIndex = 1;
    for (const p of productItems) {
      const taxRateId = p.exempt ? exemptTax.id : standardTax.id;
      // BR-09: plate units are untracked in restaurant businesses
      const trackStock = p.unit !== ProductUnit.plate;
      const initialStock = trackStock ? p.stock : 0;

      const createdProduct = await prisma.product.create({
        data: {
          businessId: bizId,
          name: p.name,
          category: p.category,
          barcode: makeBarcode(demo.code.replace(/[^A-Z]/g, ''), pIndex++),
          purchasePrice: p.purchasePrice,
          sellPrice: p.sellPrice,
          taxRateId,
          unit: p.unit,
          trackStock,
          stock: initialStock,
          minStock: p.minStock,
        },
      });

      // Record opening stock movement if tracked and has stock
      if (trackStock && initialStock > 0) {
        await prisma.stockMovement.create({
          data: {
            businessId: bizId,
            productId: createdProduct.id,
            type: MovementType.opening_stock,
            qty: initialStock,
            stockAfter: initialStock,
            reason: 'Opening stock count',
          },
        });
      }
    }

    // Customers (Walk-in record is skipped per schema §3 Customers)
    const customersData =
      demo.type === BusinessType.grocery
        ? [
            { name: 'Tshering Dema', type: CustomerType.regular, phone: '+975 17123456', address: 'Changzamtok, Thimphu', totalSpent: 18500, notes: 'Buys groceries weekly.' },
            { name: 'Karma Wangchuk', type: CustomerType.vip, phone: '+975 17234567', address: 'Motithang, Thimphu', totalSpent: 96200, creditLimit: 20000, notes: 'High-value repeat customer — priority service.' },
            { name: 'Druk Holdings Ltd', type: CustomerType.corporate, phone: '+975 2 322345', email: 'accounts@drukholdings.bt', address: 'Norzin Lam, Thimphu', gstId: 'GST-100234567', creditLimit: 50000, totalSpent: 142000, notes: 'Monthly office pantry supplies, invoiced.' },
            { name: 'Sonam General Wholesalers', type: CustomerType.wholesale, phone: '+975 17345678', address: 'Olakha Industrial Area, Thimphu', gstId: 'GST-100345678', creditLimit: 150000, totalSpent: 410000, notes: 'Bulk purchase, resells in Paro.' },
            { name: "Pema's Mini Mart", type: CustomerType.retail, phone: '+975 17456789', address: 'Babesa, Thimphu', totalSpent: 65000, notes: 'Small retail shop owner, buys in moderate volumes.' },
            { name: 'Dorji Tshering', type: CustomerType.credit, phone: '+975 17567890', address: 'Hejo, Thimphu', creditLimit: 10000, outstandingBalance: 3200, totalSpent: 27800, notes: 'Settles credit account monthly.' },
            { name: 'Thimphu Thromde Office', type: CustomerType.government_institutional, phone: '+975 2 323456', address: 'Thromde Office, Thimphu', gstId: 'GST-100456789', creditLimit: 80000, totalSpent: 210000, notes: 'Institutional supply contract, billed quarterly.' },
            { name: 'Yeshi Lhamo', type: CustomerType.online, phone: '+975 77678901', email: 'yeshi.lhamo@gmail.com', address: 'Babesa, Thimphu', totalSpent: 9400, notes: 'Orders via phone/social, delivered.' },
          ]
        : [
            { name: 'Ugyen Norbu', type: CustomerType.regular, phone: '+975 17112233', address: 'Changangkha, Thimphu', totalSpent: 22500, notes: 'Weekday lunch regular.' },
            { name: 'Jigme Namgyel', type: CustomerType.vip, phone: '+975 17223344', address: 'Motithang, Thimphu', totalSpent: 88000, creditLimit: 15000, notes: 'Frequent large group bookings.' },
            { name: 'Bhutan Telecom Ltd', type: CustomerType.corporate, phone: '+975 2 335566', email: 'events@bt.bt', address: 'Thori Lam, Thimphu', gstId: 'GST-100667788', creditLimit: 40000, totalSpent: 96000, notes: 'Monthly corporate lunch meetings, invoiced.' },
            { name: 'Tandin Wangmo', type: CustomerType.credit, phone: '+975 17334455', address: 'Hejo, Thimphu', creditLimit: 8000, outstandingBalance: 2100, totalSpent: 19600, notes: 'Running tab, settled monthly.' },
            { name: 'Royal Institute of Management', type: CustomerType.government_institutional, phone: '+975 2 341234', address: 'Semtokha, Thimphu', gstId: 'GST-100778899', creditLimit: 60000, totalSpent: 130000, notes: 'Catering for institutional events.' },
            { name: 'Sangay Choden', type: CustomerType.online, phone: '+975 77445566', email: 'sangay.choden@gmail.com', totalSpent: 5200, notes: 'Orders by phone for pickup.' },
            { name: 'Pelden Dorji', type: CustomerType.delivery, phone: '+975 77556677', address: 'Babesa, Thimphu', totalSpent: 12300, notes: 'Regular home-delivery orders.' },
          ];

    for (const c of customersData) {
      await prisma.customer.create({
        data: {
          businessId: bizId,
          name: c.name,
          type: c.type,
          phone: c.phone,
          email: c.email,
          address: c.address,
          gstId: c.gstId,
          creditLimit: c.creditLimit,
          totalSpent: c.totalSpent,
          outstandingBalance: c.outstandingBalance ?? 0,
          notes: c.notes,
        },
      });
    }

    // Customer Type Discounts
    const discountsData =
      demo.type === BusinessType.grocery
        ? [
            { customerType: CustomerType.regular, discountPct: 2 },
            { customerType: CustomerType.vip, discountPct: 5 },
            { customerType: CustomerType.corporate, discountPct: 5 },
            { customerType: CustomerType.wholesale, discountPct: 10 },
            { customerType: CustomerType.retail, discountPct: 3 },
            { customerType: CustomerType.credit, discountPct: 0 },
            { customerType: CustomerType.government_institutional, discountPct: 3 },
            { customerType: CustomerType.online, discountPct: 0 },
          ]
        : [
            { customerType: CustomerType.regular, discountPct: 3 },
            { customerType: CustomerType.vip, discountPct: 10 },
            { customerType: CustomerType.corporate, discountPct: 5 },
            { customerType: CustomerType.credit, discountPct: 0 },
            { customerType: CustomerType.government_institutional, discountPct: 5 },
            { customerType: CustomerType.online, discountPct: 0 },
            { customerType: CustomerType.delivery, discountPct: 0 },
          ];

    for (const d of discountsData) {
      await prisma.customerTypeDiscount.create({
        data: {
          businessId: bizId,
          customerType: d.customerType,
          discountPct: d.discountPct,
        },
      });
    }

    // Expenses
    const expensesData = [
      { name: 'Monthly Rent', category: ExpenseCategory.rent, amount: 18000, description: 'Store & commercial lease' },
      { name: 'Electricity & Internet', category: ExpenseCategory.utilities, amount: 4200, description: 'BPC power & Bhutan Telecom fiber' },
      { name: demo.type === BusinessType.restaurant ? 'Kitchen Supplies' : 'Store Supplies', category: ExpenseCategory.supplies, amount: 5600, description: 'Packaging and consumables' },
    ];

    for (const exp of expensesData) {
      await prisma.expense.create({
        data: {
          businessId: bizId,
          name: exp.name,
          category: exp.category,
          amount: exp.amount,
          businessDate: new Date(),
          paymentMethod: ExpensePaymentMethod.cash,
          description: exp.description,
          createdBy: adminEmployeeId,
        },
      });
    }

    // Initial Counters
    const currentYear = new Date().getFullYear();
    await prisma.counter.createMany({
      data: [
        { businessId: bizId, name: CounterName.invoice, year: currentYear, value: 0 },
        { businessId: bizId, name: CounterName.purchase, year: currentYear, value: 0 },
        { businessId: bizId, name: CounterName.kot, year: 0, value: 0 },
        { businessId: bizId, name: CounterName.credit_settlement, year: 0, value: 0 },
      ],
    });

    // Seed 30 days of realistic sales (F-25)
    await seedDemoSales(bizId, adminEmployeeId, demo.type === BusinessType.restaurant);

    console.log(`✓ Seeded demo business: ${demo.name} (${demo.type})`);
  }

  console.log('--- Database Seeding Complete ---');
}

async function seedDemoSales(bizId: string, adminId: string, isRestaurant: boolean) {
  const existingCount = await prisma.sale.count({ where: { businessId: bizId } });
  if (existingCount > 0) {
    return;
  }

  const products = await prisma.product.findMany({
    where: { businessId: bizId, active: true },
    include: { taxRate: true },
  });
  if (products.length === 0) return;

  const customers = await prisma.customer.findMany({
    where: { businessId: bizId, active: true },
  });

  const now = new Date();

  // 30 days of sales (from 29 days ago up to today)
  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const saleDate = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const bttTime = new Date(saleDate.getTime() + 6 * 60 * 60 * 1000);
    const invoiceYear = bttTime.getUTCFullYear();
    const businessDate = new Date(Date.UTC(bttTime.getUTCFullYear(), bttTime.getUTCMonth(), bttTime.getUTCDate()));

    // 2 to 4 sales per day
    const salesPerDay = 2 + ((dayOffset * 7) % 3);

    for (let s = 0; s < salesPerDay; s++) {
      // Pick 1 to 3 products
      const lineCount = 1 + ((s + dayOffset) % 3);
      const selectedProducts: typeof products = [];
      for (let l = 0; l < lineCount; l++) {
        const prod = products[(dayOffset * 3 + s + l) % products.length]!;
        if (!selectedProducts.includes(prod)) {
          selectedProducts.push(prod);
        }
      }

      // Pick optional customer (every 3rd sale)
      const customer = s % 3 === 1 && customers.length > 0
        ? customers[(dayOffset + s) % customers.length]!
        : null;

      const saleResult = computeSale({
        lines: selectedProducts.map((p, idx) => ({
          unitPrice: nuToChhertum(Number(p.sellPrice)),
          qty: 1 + (idx % 2),
          lineDiscount: 0,
          taxRate: Number(p.taxRate.rate),
          taxMode: p.taxRate.mode,
          taxCategory: p.taxRate.category,
        })),
        customerTypePct: 0,
        charges: 0,
        gstRegistered: true,
      });

      const totalNu = chhertumToNu(saleResult.total);

      const { value: seq, formatted: invoiceNo } = await nextNumber(
        prisma,
        bizId,
        CounterName.invoice,
        invoiceYear
      );

      const method = s % 2 === 0 ? PaymentMethod.cash : PaymentMethod.mbob;

      const sale = await prisma.sale.create({
        data: {
          businessId: bizId,
          invoiceNo,
          invoiceYear,
          invoiceSeq: seq,
          status: SaleStatus.completed,
          completedAt: saleDate,
          businessDate,
          cashierId: adminId,
          customerId: customer?.id ?? null,
          customerType: customer?.type ?? null,
          orderType: isRestaurant ? OrderType.dine_in : OrderType.walk_in,
          tableNo: isRestaurant ? String(1 + ((s + dayOffset) % 6)) : null,
          gstRegistered: true,
          subtotal: chhertumToNu(saleResult.subtotal),
          discountTotal: chhertumToNu(saleResult.discountTotal),
          customerTypePct: 0,
          customerTypeAmt: 0,
          billDiscountAmt: 0,
          taxableAmount: chhertumToNu(saleResult.taxableAmount),
          taxAmount: chhertumToNu(saleResult.taxAmount),
          charges: 0,
          total: totalNu,
          amountPaid: totalNu,
          creditAmount: 0,
          paymentSummary: method === PaymentMethod.cash ? 'Cash' : 'mBoB',
        },
      });

      for (let i = 0; i < saleResult.lines.length; i++) {
        const resLine = saleResult.lines[i]!;
        const p = selectedProducts[i]!;

        await prisma.saleItem.create({
          data: {
            saleId: sale.id,
            businessId: bizId,
            lineNo: i + 1,
            productId: p.id,
            name: p.name,
            barcode: p.barcode,
            category: p.category,
            unitPrice: chhertumToNu(resLine.unitPrice),
            qty: resLine.qty,
            lineDiscount: 0,
            allocatedDiscount: 0,
            taxRate: resLine.taxRate,
            taxMode: resLine.taxMode,
            taxCategory: resLine.taxCategory,
            taxable: chhertumToNu(resLine.taxable),
            tax: chhertumToNu(resLine.tax),
            total: chhertumToNu(resLine.total),
            unitCost: Number(p.purchasePrice),
            trackStock: p.trackStock,
          },
        });
      }

      await prisma.payment.create({
        data: {
          businessId: bizId,
          kind: PaymentKind.sale,
          saleId: sale.id,
          method,
          amount: totalNu,
          journalNo: method === PaymentMethod.mbob ? `MB${10000000 + s * 100 + dayOffset}` : null,
          status: PaymentStatus.completed,
          businessDate,
          createdBy: adminId,
          createdAt: saleDate,
        },
      });

      if (customer) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: { totalSpent: { increment: totalNu } },
        });
      }
    }
  }
}

// Run directly if called as a script
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seed()
    .catch((err) => {
      console.error('Seeding error:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
