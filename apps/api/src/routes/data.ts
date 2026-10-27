import { Router, Request, Response } from 'express';
import {
  EmployeeRole,
  ProductUnit,
  TaxCategory,
  TaxMode,
  CustomerType,
  MovementType,
  SaleStatus,
  PaymentKind,
  PaymentMethod,
  ExpenseCategory,
  ExpensePaymentMethod,
  OrderType,
  KitchenStatus,
  CounterName,
} from '@prisma/client';
import { prisma } from '../db/client.js';
import { requireEmployee, requirePermission } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { PrototypeImportSchema } from '@pos/shared';
import { hashPassword } from '../lib/passwords.js';
import { writeAuditLog } from '../lib/audit.js';
import { generateUniqueBarcode } from './products.js';

export const dataRouter: Router = Router();

dataRouter.use(requireEmployee);

/**
 * GET /data/export
 * JSON download of all business data (no password hashes, session, or TOTP data) (AC-55, F-21).
 */
dataRouter.get(
  '/export',
  requirePermission('data.export_import'),
  async (req: Request, res: Response) => {
    const businessId = req.business!.id;

    const [
      business,
      subscription,
      subscriptionEvents,
      employees,
      taxRates,
      customerTypeDiscounts,
      products,
      stockMovements,
      suppliers,
      purchases,
      customers,
      sales,
      payments,
      expenses,
      kitchenOrders,
      auditLogs,
    ] = await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          businessCode: true,
          name: true,
          type: true,
          ownerName: true,
          phone: true,
          email: true,
          address: true,
          gstNo: true,
          gstRegistered: true,
          logoPath: true,
          createdAt: true,
        },
      }),
      prisma.subscription.findUnique({
        where: { businessId },
        select: {
          plan: true,
          status: true,
          startedAt: true,
          expiresAt: true,
        },
      }),
      prisma.subscriptionEvent.findMany({
        where: { businessId },
        select: {
          id: true,
          event: true,
          plan: true,
          amount: true,
          detail: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.employee.findMany({
        where: { businessId },
        select: {
          id: true,
          username: true,
          name: true,
          role: true,
          active: true,
          language: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.taxRate.findMany({
        where: { businessId },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.customerTypeDiscount.findMany({
        where: { businessId },
      }),
      prisma.product.findMany({
        where: { businessId },
        orderBy: { name: 'asc' },
      }),
      prisma.stockMovement.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.supplier.findMany({
        where: { businessId },
        orderBy: { name: 'asc' },
      }),
      prisma.purchase.findMany({
        where: { businessId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customer.findMany({
        where: { businessId },
        orderBy: { name: 'asc' },
      }),
      prisma.sale.findMany({
        where: { businessId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payment.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.expense.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.kitchenOrder.findMany({
        where: { businessId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    await writeAuditLog({
      businessId,
      actorEmployeeId: req.employee!.id,
      actorName: req.employee!.name,
      action: 'data_exported',
      detail: 'Full JSON backup downloaded',
    });

    const exportPayload = {
      app: 'POS SYSTEM',
      version: 1,
      exportDate: new Date().toISOString(),
      business,
      subscription,
      subscriptionEvents,
      collections: {
        employees,
        taxRates,
        customerTypeDiscounts,
        products,
        stockMovements,
        suppliers,
        purchases,
        customers,
        sales,
        payments,
        expenses,
        kitchenOrders,
        auditLogs,
      },
    };

    const filename = `pos-backup-${business?.businessCode || 'export'}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).json(exportPayload);
  }
);

/**
 * POST /data/import-prototype
 * One-time import of prototype backup JSON file (AC-54, F-21, 06-BACKEND-SCHEMA.md §8).
 */
dataRouter.post(
  '/import-prototype',
  requirePermission('data.export_import'),
  async (req: Request, res: Response) => {
    const businessId = req.business!.id;

    // Precondition: check if sales exist (AC-54)
    const existingSalesCount = await prisma.sale.count({
      where: { businessId },
    });

    if (existingSalesCount > 0) {
      throw AppError.importNotAllowed(
        'Cannot import prototype backup: sales have already been recorded for this business (AC-54).'
      );
    }

    // Also check if already imported
    const alreadyImportedLog = await prisma.auditLog.findFirst({
      where: {
        businessId,
        action: 'prototype_imported',
      },
    });

    if (alreadyImportedLog) {
      throw AppError.importNotAllowed(
        'Prototype backup has already been imported for this business.'
      );
    }

    const parseResult = PrototypeImportSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw AppError.validation('Invalid prototype backup format.', parseResult.error.format());
    }

    const payload = parseResult.data;
    const collections = payload.collections || {};

    const importedUsers: Array<{ username: string; fullName: string; role: string }> = [];

    const counts = {
      products: 0,
      customers: 0,
      suppliers: 0,
      expenses: 0,
      sales: 0,
      payments: 0,
      kitchenOrders: 0,
      auditLogs: 0,
    };

    // Execute import in a single database transaction
    await prisma.$transaction(
      async (tx) => {
        // 1. Update business profile if present
        if (payload.business) {
          const b = payload.business;
          await tx.business.update({
            where: { id: businessId },
            data: {
              ...(b.ownerName ? { ownerName: String(b.ownerName) } : {}),
              ...(b.phone ? { phone: String(b.phone) } : {}),
              ...(b.email ? { email: String(b.email) } : {}),
              ...(b.address !== undefined ? { address: b.address ? String(b.address) : null } : {}),
              ...(b.gstNo !== undefined ? { gstNo: b.gstNo ? String(b.gstNo) : null } : {}),
              ...(b.gstNo ? { gstRegistered: true } : {}),
            },
          });
        }

        // 2. Tax Rates mapping (oldTaxId -> newTaxId)
        interface TaxRateDetail {
          id: string;
          rate: number;
          mode: TaxMode;
          category: TaxCategory;
        }
        const taxRateMap = new Map<string, string>();
        const taxRateDetailMap = new Map<string, TaxRateDetail>();
        const existingTaxRates = await tx.taxRate.findMany({
          where: { businessId },
        });

        const defaultTaxRate = existingTaxRates.find((t) => t.isDefault) || existingTaxRates[0];
        const defaultTaxRateDetail: TaxRateDetail = defaultTaxRate
          ? {
              id: defaultTaxRate.id,
              rate: Number(defaultTaxRate.rate),
              mode: defaultTaxRate.mode,
              category: defaultTaxRate.category,
            }
          : {
              id: '',
              rate: 0,
              mode: TaxMode.exclusive,
              category: TaxCategory.standard,
            };

        const rawTaxRates = collections.taxrates || [];
        for (const rawTR of rawTaxRates) {
          const oldId = String(rawTR.id || '');
          const rateNum = Number(rawTR.rate ?? 0);
          const name = String(rawTR.name || `GST ${rateNum}%`);
          const mode = (String(rawTR.mode || 'exclusive').toLowerCase() === 'inclusive'
            ? TaxMode.inclusive
            : TaxMode.exclusive) as TaxMode;
          const category = rateNum === 0 ? TaxCategory.zero_rated : TaxCategory.standard;

          // Check if rate already exists by percentage and mode
          const matched = existingTaxRates.find(
            (t) => Number(t.rate) === rateNum && t.mode === mode
          );

          if (matched) {
            taxRateMap.set(oldId, matched.id);
            taxRateDetailMap.set(oldId, {
              id: matched.id,
              rate: Number(matched.rate),
              mode: matched.mode,
              category: matched.category,
            });
          } else {
            const createdTR = await tx.taxRate.create({
              data: {
                businessId,
                name,
                rate: rateNum,
                mode,
                category,
                effectiveDate: new Date(),
                isDefault: Boolean(rawTR.isDefault),
                active: rawTR.active !== false,
              },
            });
            taxRateMap.set(oldId, createdTR.id);
            taxRateDetailMap.set(oldId, {
              id: createdTR.id,
              rate: Number(createdTR.rate),
              mode: createdTR.mode,
              category: createdTR.category,
            });
          }
        }

        // 3. Employees / Users mapping
        const employeeMap = new Map<string, string>();
        const existingEmployees = await tx.employee.findMany({
          where: { businessId },
        });

        const existingUsernames = new Set(existingEmployees.map((e) => e.username.toLowerCase()));

        // Role mapper
        const mapRole = (roleStr: string): EmployeeRole => {
          const lower = String(roleStr || '').toLowerCase().trim();
          if (lower.includes('admin')) return EmployeeRole.admin;
          if (lower.includes('manager')) return EmployeeRole.manager;
          if (lower.includes('inventory')) return EmployeeRole.inventory_officer;
          if (lower.includes('store')) return EmployeeRole.storekeeper;
          if (lower.includes('waiter')) return EmployeeRole.waiter;
          if (lower.includes('kitchen')) return EmployeeRole.kitchen_staff;
          if (lower.includes('accountant')) return EmployeeRole.accountant;
          return EmployeeRole.cashier;
        };

        const rawUsers = collections.users || [];
        for (const rawUser of rawUsers) {
          const oldId = String(rawUser.id || '');
          const originalUsername = String(rawUser.username || `user_${oldId}`).trim();
          const fullName = String(rawUser.fullName || originalUsername);
          const role = mapRole(String(rawUser.role || ''));

          // Check if username already exists in this business
          let finalUsername = originalUsername;
          let suffix = 2;
          while (existingUsernames.has(finalUsername.toLowerCase())) {
            // Check if this is the exact same admin user
            const matchedExisting = existingEmployees.find(
              (e) => e.username.toLowerCase() === finalUsername.toLowerCase()
            );
            if (matchedExisting && matchedExisting.role === EmployeeRole.admin && role === EmployeeRole.admin) {
              employeeMap.set(oldId, matchedExisting.id);
              finalUsername = '';
              break;
            }
            finalUsername = `${originalUsername}-${suffix}`;
            suffix++;
          }

          if (!finalUsername) {
            continue;
          }

          existingUsernames.add(finalUsername.toLowerCase());

          // Passwords NOT imported: random temporary password
          const tempPassword = `Temp#${Math.random().toString(36).slice(-8)}!`;
          const passwordHash = await hashPassword(tempPassword);

          const newEmployee = await tx.employee.create({
            data: {
              businessId,
              username: finalUsername,
              usernameKey: finalUsername.toLowerCase(),
              name: fullName,
              role,
              passwordHash,
              mustChangePassword: true,
              active: rawUser.active !== false,
            },
          });

          employeeMap.set(oldId, newEmployee.id);
          importedUsers.push({
            username: finalUsername,
            fullName,
            role,
          });
        }

        // 4. Suppliers mapping
        const supplierMap = new Map<string, string>();
        const rawSuppliers = collections.suppliers || [];
        for (const rawSup of rawSuppliers) {
          const oldId = String(rawSup.id || '');
          const name = String(rawSup.name || 'Supplier');
          const openingPaid = Number(rawSup.amountPaid || 0);
          const openingOutstanding = Number(rawSup.amountOutstanding || 0);

          let phone: string | null = null;
          let email: string | null = null;
          const contact = String(rawSup.contact || '');
          if (contact.includes('@')) {
            email = contact;
          } else if (contact) {
            phone = contact;
          }

          if (rawSup.phone) phone = String(rawSup.phone);
          if (rawSup.email) email = String(rawSup.email);

          const supplier = await tx.supplier.create({
            data: {
              businessId,
              name,
              phone,
              email,
              address: rawSup.address ? String(rawSup.address) : null,
              notes: rawSup.notes ? String(rawSup.notes) : null,
              openingPaid,
              openingOutstanding,
              active: rawSup.active !== false,
            },
          });

          supplierMap.set(oldId, supplier.id);
          counts.suppliers++;
        }

        // 5. Products mapping
        interface ProductDetail {
          id: string;
          name: string;
          barcode: string;
          category: string;
          purchasePrice: number;
          sellPrice: number;
          taxRate: TaxRateDetail;
          trackStock: boolean;
        }
        const productMap = new Map<string, string>();
        const productDetailMap = new Map<string, ProductDetail>();
        const rawProducts = collections.products || [];
        const seenBarcodes = new Set<string>();

        const existingProducts = await tx.product.findMany({
          where: { businessId },
          select: { barcode: true },
        });
        for (const p of existingProducts) {
          seenBarcodes.add(p.barcode);
        }

        for (const rawProd of rawProducts) {
          const oldId = String(rawProd.id || '');
          const name = String(rawProd.name || 'Product');
          const category = String(rawProd.category || 'General');
          const purchasePrice = Number(rawProd.purchasePrice || 0);
          const sellPrice = Number(rawProd.sellPrice || 0);
          const stock = Math.max(0, parseInt(String(rawProd.stock || '0'), 10) || 0);
          const minStock = Math.max(0, parseInt(String(rawProd.minStock || '5'), 10) || 5);
          const rawUnitStr = rawProd.unit ? String(rawProd.unit).toLowerCase() : 'pc';
          const validUnits = Object.values(ProductUnit) as string[];
          const unit: ProductUnit = validUnits.includes(rawUnitStr)
            ? (rawUnitStr as ProductUnit)
            : ProductUnit.pc;

          // Determine barcode
          let barcode = String(rawProd.barcode || '').trim();
          if (!barcode || seenBarcodes.has(barcode)) {
            barcode = await generateUniqueBarcode(businessId);
          }
          seenBarcodes.add(barcode);

          // Track stock per BR-09
          const trackStock =
            req.business!.type === 'restaurant' && unit === 'plate'
              ? false
              : rawProd.trackStock !== false;

          // Tax rate
          let taxRateId = defaultTaxRate?.id;
          let taxRateDetail = defaultTaxRateDetail;
          const oldTaxId = String(rawProd.taxId || '');
          if (taxRateMap.has(oldTaxId)) {
            taxRateId = taxRateMap.get(oldTaxId)!;
            taxRateDetail = taxRateDetailMap.get(oldTaxId) || defaultTaxRateDetail;
          }

          const supplierId = supplierMap.get(String(rawProd.supplierId || '')) || null;

          const product = await tx.product.create({
            data: {
              businessId,
              name,
              barcode,
              category,
              purchasePrice,
              sellPrice,
              taxRateId: taxRateId!,
              unit,
              trackStock,
              stock: trackStock ? stock : 0,
              minStock,
              supplierId,
              active: rawProd.active !== false,
            },
          });

          productMap.set(oldId, product.id);
          productDetailMap.set(oldId, {
            id: product.id,
            name: product.name,
            barcode: product.barcode,
            category: product.category,
            purchasePrice,
            sellPrice,
            taxRate: taxRateDetail,
            trackStock,
          });
          counts.products++;

          // Opening stock movement
          if (trackStock && stock > 0) {
            await tx.stockMovement.create({
              data: {
                businessId,
                productId: product.id,
                type: MovementType.opening_stock,
                qty: stock,
                stockAfter: stock,
                reason: 'Opening stock (prototype import)',
                createdBy: req.employee!.id,
              },
            });
          }
        }

        // 6. Inventory movements history (collections.inventory)
        const rawInventory = collections.inventory || [];
        for (const rawInv of rawInventory) {
          const oldProdId = String(rawInv.productId || '');
          const newProdId = productMap.get(oldProdId);
          if (!newProdId) continue;

          let movementType: MovementType = MovementType.adjustment;
          const rawType = String(rawInv.type || '').toLowerCase();
          if (rawType.includes('in') || rawType === 'stock_in') movementType = MovementType.stock_in;
          else if (rawType.includes('out') || rawType === 'stock_out') movementType = MovementType.stock_out;

          const qty = parseInt(String(rawInv.qty || '0'), 10) || 0;
          const createdAt = rawInv.date ? new Date(String(rawInv.date)) : new Date();

          await tx.stockMovement.create({
            data: {
              businessId,
              productId: newProdId,
              type: movementType,
              qty,
              stockAfter: 0,
              reason: rawInv.reason ? String(rawInv.reason) : 'Prototype import historical movement',
              createdBy: req.employee!.id,
              createdAt,
            },
          });
        }

        // 7. Customers mapping
        const customerMap = new Map<string, string>();
        const rawCustomers = collections.customers || [];
        for (const rawCust of rawCustomers) {
          const name = String(rawCust.name || '').trim();
          // Skip Walk-in Customer per 06 §8
          if (name.toLowerCase().includes('walk-in')) {
            continue;
          }

          const oldId = String(rawCust.id || '');
          const typeStr = String(rawCust.type || '').toLowerCase();
          let customerType: CustomerType = CustomerType.regular;
          if (typeStr.includes('vip')) customerType = CustomerType.vip;
          else if (typeStr.includes('corp')) customerType = CustomerType.corporate;
          else if (typeStr.includes('whole')) customerType = CustomerType.wholesale;
          else if (typeStr.includes('retail')) customerType = CustomerType.retail;
          else if (typeStr.includes('credit')) customerType = CustomerType.credit;
          else if (typeStr.includes('gov')) customerType = CustomerType.government_institutional;
          else if (typeStr.includes('online')) customerType = CustomerType.online;
          else if (typeStr.includes('deliv')) customerType = CustomerType.delivery;

          const creditLimit = Number(rawCust.creditLimit || 0);
          const openingBalance = Number(rawCust.openingBalance || rawCust.balance || 0);

          const customer = await tx.customer.create({
            data: {
              businessId,
              name,
              type: customerType,
              phone: rawCust.phone ? String(rawCust.phone) : null,
              email: rawCust.email ? String(rawCust.email) : null,
              address: rawCust.address ? String(rawCust.address) : null,
              creditLimit: creditLimit > 0 ? creditLimit : null,
              outstandingBalance: openingBalance,
              totalSpent: Number(rawCust.totalSpent || 0),
              active: rawCust.active !== false,
            },
          });

          customerMap.set(oldId, customer.id);
          counts.customers++;
        }

        // 8. Expenses mapping
        const rawExpenses = collections.expenses || [];
        for (const rawExp of rawExpenses) {
          const name = String(rawExp.name || rawExp.note || 'Expense');
          const amount = Number(rawExp.amount || 0);
          const catStr = String(rawExp.category || '').toLowerCase();

          let category: ExpenseCategory = ExpenseCategory.other;
          if (catStr.includes('rent')) category = ExpenseCategory.rent;
          else if (catStr.includes('util')) category = ExpenseCategory.utilities;
          else if (catStr.includes('salar') || catStr.includes('wage')) category = ExpenseCategory.salaries;
          else if (catStr.includes('suppl')) category = ExpenseCategory.supplies;
          else if (catStr.includes('maint')) category = ExpenseCategory.maintenance;
          else if (catStr.includes('market')) category = ExpenseCategory.marketing;

          let paymentMethod: ExpensePaymentMethod = ExpensePaymentMethod.cash;
          const payStr = String(rawExp.paymentMethod || rawExp.method || '').toLowerCase();
          if (payStr.includes('card')) paymentMethod = ExpensePaymentMethod.card;
          else if (payStr.includes('bank')) paymentMethod = ExpensePaymentMethod.bank_transfer;
          else if (payStr.includes('wallet') || payStr.includes('mbob') || payStr.includes('mpay'))
            paymentMethod = ExpensePaymentMethod.mobile_wallet;

          const businessDate = rawExp.date ? new Date(String(rawExp.date)) : new Date();

          await tx.expense.create({
            data: {
              businessId,
              name,
              category,
              amount,
              businessDate,
              paymentMethod,
              description: rawExp.description ? String(rawExp.description) : null,
              createdBy: req.employee!.id,
            },
          });
          counts.expenses++;
        }

        // 9. Sales / Transactions mapping
        const saleMap = new Map<string, string>();
        const rawTransactions = collections.transactions || [];
        let maxInvoiceNum = 0;
        const currentYear = new Date().getFullYear();

        for (let i = 0; i < rawTransactions.length; i++) {
          const rawTxn = rawTransactions[i];
          if (!rawTxn) continue;
          const oldId = String(rawTxn.id || '');
          const invoiceNo = String(rawTxn.invoiceNo || `INV-${currentYear}-${String(i + 1).padStart(5, '0')}`);

          // Parse sequence number from invoiceNo
          let seq = i + 1;
          let invoiceYear = currentYear;
          const match = invoiceNo.match(/INV-(\d{4})-(\d+)/);
          if (match && match[1] && match[2]) {
            invoiceYear = parseInt(match[1], 10);
            seq = parseInt(match[2], 10);
            if (seq > maxInvoiceNum) maxInvoiceNum = seq;
          }

          const rawStatus = String(rawTxn.status || '').toLowerCase();
          const status = rawStatus === 'voided' ? SaleStatus.voided : SaleStatus.completed;

          const customerId = customerMap.get(String(rawTxn.customerId || '')) || null;
          const cashierId = employeeMap.get(String(rawTxn.cashierId || '')) || req.employee!.id;

          const subtotal = Number(rawTxn.subtotal || 0);
          const discountTotal = Number(rawTxn.discount || rawTxn.discountTotal || 0);
          const taxTotal = Number(rawTxn.gst || rawTxn.taxTotal || 0);
          const total = Number(rawTxn.total || Math.max(0, subtotal - discountTotal + taxTotal));
          const createdAt = rawTxn.date ? new Date(String(rawTxn.date)) : new Date();
          const businessDate = new Date(createdAt.toISOString().slice(0, 10));
          const amountPaid = Number(rawTxn.amountPaid ?? total);
          const creditAmount = Math.max(0, total - amountPaid);

          const sale = await tx.sale.create({
            data: {
              businessId,
              invoiceNo,
              invoiceYear,
              invoiceSeq: seq,
              status,
              completedAt: createdAt,
              businessDate,
              cashierId,
              customerId,
              orderType: OrderType.walk_in,
              gstRegistered: Boolean(req.business?.gstRegistered),
              subtotal,
              discountTotal,
              taxableAmount: Math.max(0, subtotal - discountTotal),
              taxAmount: taxTotal,
              total,
              amountPaid,
              creditAmount,
              paymentSummary: String(rawTxn.paymentSummary || rawTxn.paymentMethod || 'cash'),
              createdAt,
            },
          });

          saleMap.set(oldId, sale.id);
          counts.sales++;

          // Lines
          const lines = Array.isArray(rawTxn.lines) ? rawTxn.lines : [];
          for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const oldProdId = String(line.productId || '');
            const prodDetail = productDetailMap.get(oldProdId);
            if (!prodDetail) continue;

            const qty = parseInt(String(line.qty || '1'), 10) || 1;
            const unitPrice = Number(line.price || line.unitPrice || prodDetail.sellPrice);
            const lineDiscount = Number(line.discount || 0);
            const lineTax = Number(line.taxAmount || line.tax || 0);
            const lineTotal = Number(line.total || (qty * unitPrice - lineDiscount + lineTax));
            const taxable = Math.max(0, qty * unitPrice - lineDiscount);

            await tx.saleItem.create({
              data: {
                saleId: sale.id,
                businessId,
                lineNo: lineIndex + 1,
                productId: prodDetail.id,
                name: String(line.name || prodDetail.name),
                barcode: prodDetail.barcode,
                category: prodDetail.category,
                unitPrice,
                qty,
                lineDiscount,
                taxRate: prodDetail.taxRate.rate,
                taxMode: prodDetail.taxRate.mode,
                taxCategory: prodDetail.taxRate.category,
                taxable,
                tax: lineTax,
                total: lineTotal,
                unitCost: prodDetail.purchasePrice,
                trackStock: prodDetail.trackStock,
              },
            });
          }
        }

        // 10. Payments mapping
        const rawPayments = collections.payments || [];
        for (const rawPay of rawPayments) {
          const rawMethod = String(rawPay.method || 'cash').toLowerCase();
          let method: PaymentMethod = PaymentMethod.cash;
          if (rawMethod.includes('mbob')) method = PaymentMethod.mbob;
          else if (rawMethod.includes('mpay')) method = PaymentMethod.mpay;
          else if (rawMethod.includes('tpay') || rawMethod.includes('t-pay')) method = PaymentMethod.tpay;
          else if (rawMethod.includes('card')) method = PaymentMethod.card;
          else if (rawMethod.includes('dk')) method = PaymentMethod.dk_bank;
          else if (rawMethod.includes('credit')) method = PaymentMethod.credit;
          else if (rawMethod.includes('bank')) method = PaymentMethod.bank;
          else if (rawMethod.includes('wallet') || rawMethod.includes('mobile')) method = PaymentMethod.other_wallet;

          const rawKind = String(rawPay.kind || '').toLowerCase();
          const kind = rawKind.includes('settlement')
            ? PaymentKind.credit_settlement
            : PaymentKind.sale;

          const oldTxnId = String(rawPay.transactionId || rawPay.saleId || '');
          const saleId = saleMap.get(oldTxnId) || null;
          const oldCustId = String(rawPay.customerId || '');
          const customerId = customerMap.get(oldCustId) || null;

          const amount = Number(rawPay.amount || 0);
          const createdAt = rawPay.date ? new Date(String(rawPay.date)) : new Date();
          const businessDate = new Date(createdAt.toISOString().slice(0, 10));

          await tx.payment.create({
            data: {
              businessId,
              saleId,
              customerId,
              method,
              kind,
              amount,
              cashReceived: rawPay.cashReceived ? Number(rawPay.cashReceived) : null,
              changeGiven: rawPay.changeGiven ? Number(rawPay.changeGiven) : null,
              businessDate,
              createdBy: req.employee!.id,
              createdAt,
            },
          });
          counts.payments++;
        }

        // 11. Counters update
        if (maxInvoiceNum > 0) {
          await tx.counter.upsert({
            where: {
              businessId_name_year: {
                businessId,
                name: CounterName.invoice,
                year: currentYear,
              },
            },
            create: {
              businessId,
              name: CounterName.invoice,
              year: currentYear,
              value: maxInvoiceNum,
            },
            update: {
              value: maxInvoiceNum,
            },
          });
        }

        // 12. Kitchen orders mapping
        const rawOrders = collections.orders || [];
        for (const rawOrder of rawOrders) {
          let status: KitchenStatus = KitchenStatus.served;
          const s = String(rawOrder.status || '').toLowerCase();
          if (s === 'new') status = KitchenStatus.new;
          else if (s === 'accepted') status = KitchenStatus.accepted;
          else if (s === 'preparing') status = KitchenStatus.preparing;
          else if (s === 'ready') status = KitchenStatus.ready;
          else if (s === 'cancelled') status = KitchenStatus.cancelled;

          let orderType: OrderType = OrderType.walk_in;
          const ot = String(rawOrder.orderType || '').toLowerCase();
          if (ot.includes('dine')) orderType = OrderType.dine_in;
          else if (ot.includes('take')) orderType = OrderType.takeaway;
          else if (ot.includes('deliv')) orderType = OrderType.delivery;
          else if (ot.includes('pre-order') || ot.includes('pre_order')) orderType = OrderType.pre_ordered;
          else if (ot.includes('book')) orderType = OrderType.pre_booked;

          const orderNo = String(rawOrder.orderNo || `KOT-${Math.floor(1000 + Math.random() * 9000)}`);
          const tableNo = rawOrder.tableNo ? String(rawOrder.tableNo) : null;
          const createdAt = rawOrder.date ? new Date(String(rawOrder.date)) : new Date();

          const ko = await tx.kitchenOrder.create({
            data: {
              businessId,
              orderNo,
              status,
              orderType,
              tableNo,
              billed: true,
              createdBy: req.employee!.id,
              createdAt,
            },
          });
          counts.kitchenOrders++;

          const items = Array.isArray(rawOrder.items) ? rawOrder.items : [];
          for (const item of items) {
            const oldProdId = String(item.productId || '');
            const newProdId = productMap.get(oldProdId);
            if (!newProdId) continue;

            await tx.kitchenOrderItem.create({
              data: {
                kitchenOrderId: ko.id,
                businessId,
                productId: newProdId,
                name: String(item.name || 'Dish'),
                qty: parseInt(String(item.qty || '1'), 10) || 1,
              },
            });
          }
        }

        // 13. Audit logs history
        const rawAuditLogs = collections.auditLogs || [];
        for (const rawLog of rawAuditLogs) {
          await tx.auditLog.create({
            data: {
              businessId,
              actorName: String(rawLog.by || rawLog.actorName || 'System'),
              action: String(rawLog.action || 'system_event'),
              detail: String(rawLog.details || rawLog.detail || ''),
              createdAt: rawLog.date ? new Date(String(rawLog.date)) : new Date(),
            },
          });
          counts.auditLogs++;
        }

        // 14. Record import completion audit log
        await writeAuditLog(
          {
            businessId,
            actorEmployeeId: req.employee!.id,
            actorName: req.employee!.name,
            action: 'prototype_imported',
            detail: `Imported prototype backup: ${counts.products} products, ${counts.customers} customers, ${counts.sales} sales, ${counts.suppliers} suppliers`,
          },
          tx
        );
      },
      {
        timeout: 30000, // 30s timeout for large multi-table batch
      }
    );

    res.status(200).json({
      data: {
        counts,
        importedUsers,
      },
    });
  }
);
