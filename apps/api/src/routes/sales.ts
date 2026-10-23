import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { requireEmployee, requirePermission, requireActiveSubscription } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { nextNumber } from '../lib/counters.js';
import { withIdempotency } from '../lib/idempotency.js';
import { writeAuditLog } from '../lib/audit.js';
import {
  computeSale,
  nuToChhertum,
  chhertumToNu,
  amountInWords,
} from '@pos/shared';
import {
  CounterName,
  MovementType,
  SaleStatus,
  PaymentStatus,
  PaymentKind,
  PaymentMethod,
  BillDiscountType,
  OrderType,
  CustomerType,
  Prisma,
} from '@prisma/client';

export const salesRouter: Router = Router();

salesRouter.use(requireEmployee);
salesRouter.use(requireActiveSubscription);

const saleLineSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().min(1).max(9999),
  unitPrice: z.number().positive(),
  lineDiscount: z.number().min(0).default(0),
});

const billDiscountSchema = z
  .object({
    type: z.enum(['percent', 'amount']),
    value: z.number().min(0),
  })
  .nullable()
  .optional();

const paymentLineSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amount: z.number().positive(),
  cashReceived: z.number().nullable().optional(),
  fee: z.number().min(0).default(0),
  bankName: z.string().nullable().optional(),
  journalNo: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

const createSaleSchema = z.object({
  tableNo: z.string().max(10).nullable().optional(),
  orderType: z.nativeEnum(OrderType).default(OrderType.walk_in),
  customerId: z.string().uuid().nullable().optional(),
  kitchenOrderId: z.string().uuid().nullable().optional(),
  heldOrderId: z.string().uuid().nullable().optional(),
  lines: z.array(saleLineSchema).min(1),
  billDiscount: billDiscountSchema,
  charges: z.number().min(0).default(0),
  payments: z.array(paymentLineSchema).min(1),
  expectedTotal: z.number().optional(),
});

const voidSaleSchema = z.object({
  reason: z.string().min(3).max(200),
});

interface SaleFormatted {
  id: string;
  invoiceNo: string;
  status: string;
  completedAt: string;
  businessDate: string;
  cashier: { id: string; name: string };
  customer: {
    id: string;
    name: string;
    phone: string | null;
    type: string;
    gstId: string | null;
  } | null;
  orderType: string;
  tableNo: string | null;
  kitchenOrderId: string | null;
  gstRegistered: boolean;
  subtotal: number;
  discountTotal: number;
  customerTypePct: number;
  customerTypeAmt: number;
  billDiscount: {
    type: string;
    value: number;
    amount: number;
  } | null;
  taxableAmount: number;
  taxAmount: number;
  gstByRate: Array<{
    rate: number;
    category: string;
    taxable: number;
    tax: number;
  }>;
  charges: number;
  total: number;
  amountPaid: number;
  creditAmount: number;
  paymentSummary: string;
  amountInWords: string;
  items: Array<{
    lineNo: number;
    productId: string;
    name: string;
    unitPrice: number;
    qty: number;
    lineDiscount: number;
    allocatedDiscount: number;
    taxRate: number;
    taxMode: string;
    taxCategory: string;
    taxable: number;
    tax: number;
    total: number;
  }>;
  payments: Array<{
    method: string;
    amount: number;
    cashReceived: number | null;
    changeGiven: number | null;
    bankName: string | null;
    journalNo: string | null;
    status: string;
  }>;
  voided: {
    at: string;
    by: { id: string; name: string } | null;
    reason: string | null;
  } | null;
}

function formatSaleResponse(sale: Prisma.SaleGetPayload<{
  include: {
    cashier: { select: { id: true; name: true } };
    customer: { select: { id: true; name: true; phone: true; type: true; gstId: true } };
    items: true;
    payments: true;
    voider: { select: { id: true; name: true } };
  };
}>): SaleFormatted {
  // Aggregate GST breakdown by rate & category
  const rateMap = new Map<string, { rate: number; category: string; taxable: number; tax: number }>();
  for (const item of sale.items) {
    const key = `${Number(item.taxRate)}_${item.taxCategory}`;
    const existing = rateMap.get(key);
    if (existing) {
      existing.taxable = Math.round((existing.taxable + Number(item.taxable)) * 100) / 100;
      existing.tax = Math.round((existing.tax + Number(item.tax)) * 100) / 100;
    } else {
      rateMap.set(key, {
        rate: Number(item.taxRate),
        category: item.taxCategory,
        taxable: Number(item.taxable),
        tax: Number(item.tax),
      });
    }
  }

  const gstByRate = Array.from(rateMap.values()).sort(
    (a, b) => a.rate - b.rate || a.category.localeCompare(b.category)
  );

  return {
    id: sale.id,
    invoiceNo: sale.invoiceNo,
    status: sale.status,
    completedAt: sale.completedAt.toISOString(),
    businessDate: sale.businessDate.toISOString().slice(0, 10),
    cashier: {
      id: sale.cashier.id,
      name: sale.cashier.name,
    },
    customer: sale.customer
      ? {
          id: sale.customer.id,
          name: sale.customer.name,
          phone: sale.customer.phone,
          type: sale.customer.type,
          gstId: sale.customer.gstId,
        }
      : null,
    orderType: sale.orderType,
    tableNo: sale.tableNo,
    kitchenOrderId: sale.kitchenOrderId,
    gstRegistered: sale.gstRegistered,
    subtotal: Number(sale.subtotal),
    discountTotal: Number(sale.discountTotal),
    customerTypePct: Number(sale.customerTypePct),
    customerTypeAmt: Number(sale.customerTypeAmt),
    billDiscount: sale.billDiscountType
      ? {
          type: sale.billDiscountType,
          value: Number(sale.billDiscountValue),
          amount: Number(sale.billDiscountAmt),
        }
      : null,
    taxableAmount: Number(sale.taxableAmount),
    taxAmount: Number(sale.taxAmount),
    gstByRate,
    charges: Number(sale.charges),
    total: Number(sale.total),
    amountPaid: Number(sale.amountPaid),
    creditAmount: Number(sale.creditAmount),
    paymentSummary: sale.paymentSummary,
    amountInWords: amountInWords(Number(sale.total)),
    items: sale.items.map((i) => ({
      lineNo: i.lineNo,
      productId: i.productId,
      name: i.name,
      unitPrice: Number(i.unitPrice),
      qty: i.qty,
      lineDiscount: Number(i.lineDiscount),
      allocatedDiscount: Number(i.allocatedDiscount),
      taxRate: Number(i.taxRate),
      taxMode: i.taxMode,
      taxCategory: i.taxCategory,
      taxable: Number(i.taxable),
      tax: Number(i.tax),
      total: Number(i.total),
    })),
    payments: sale.payments.map((p) => ({
      method: p.method,
      amount: Number(p.amount),
      cashReceived: p.cashReceived !== null ? Number(p.cashReceived) : null,
      changeGiven: p.changeGiven !== null ? Number(p.changeGiven) : null,
      bankName: p.bankName,
      journalNo: p.journalNo,
      status: p.status,
    })),
    voided: sale.voidedAt
      ? {
          at: sale.voidedAt.toISOString(),
          by: sale.voider ? { id: sale.voider.id, name: sale.voider.name } : null,
          reason: sale.voidReason,
        }
      : null,
  };
}

/**
 * POST /sales
 * Complete a sale per BR-21.
 */
salesRouter.post('/', requirePermission('pos.sell'), async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const employeeId = req.employee!.id;
  const idempotencyKey = req.header('Idempotency-Key')?.trim();

  const parseResult = createSaleSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw AppError.badRequest(parseResult.error.errors[0]?.message || 'Invalid sale payload');
  }
  const body = parseResult.data;

  const result = await withIdempotency(
    businessId,
    employeeId,
    idempotencyKey,
    req.originalUrl,
    async () => {
      return await prisma.$transaction(async (tx) => {
        // 1. Asia/Thimphu Date and Year Calculation (BR-23, BR-33)
        const now = new Date();
        const bttTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
        const invoiceYear = bttTime.getUTCFullYear();
        const businessDateStr = bttTime.toISOString().slice(0, 10);
        const businessDate = new Date(`${businessDateStr}T00:00:00.000Z`);

        // 2. Lock and fetch products to prevent concurrency issues (BR-21, AC-34)
        const productIds = [...new Set(body.lines.map((l) => l.productId))].sort();

        await tx.$queryRaw`
          SELECT id FROM "products"
          WHERE "id" IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))})
          FOR UPDATE
        `;

        const products = await tx.product.findMany({
          where: {
            id: { in: productIds },
            businessId,
          },
          include: { taxRate: true },
        });

        const productMap = new Map<string, (typeof products)[0]>();
        for (const p of products) {
          productMap.set(p.id, p);
        }

        // Validate products exist and are active
        for (const line of body.lines) {
          const p = productMap.get(line.productId);
          if (!p || !p.active) {
            throw AppError.productUnavailable(`Product ${line.productId} is unavailable`);
          }

          // Price change check (BR-21, AC-36)
          if (nuToChhertum(line.unitPrice) !== nuToChhertum(Number(p.sellPrice))) {
            throw AppError.priceChanged(
              `Price for "${p.name}" has changed from Nu. ${line.unitPrice} to Nu. ${Number(p.sellPrice)}`,
              {
                productId: p.id,
                name: p.name,
                oldPrice: line.unitPrice,
                newPrice: Number(p.sellPrice),
              }
            );
          }
        }

        // Aggregate requested quantities and check stock (BR-22, AC-34)
        const qtyByProduct = new Map<string, number>();
        for (const line of body.lines) {
          qtyByProduct.set(line.productId, (qtyByProduct.get(line.productId) || 0) + line.qty);
        }

        const insufficient: Array<{ id: string; name: string; available: number; requested: number }> = [];
        for (const [pId, requested] of qtyByProduct.entries()) {
          const p = productMap.get(pId)!;
          if (p.trackStock && p.stock < requested) {
            insufficient.push({
              id: p.id,
              name: p.name,
              available: p.stock,
              requested,
            });
          }
        }

        if (insufficient.length > 0) {
          throw AppError.insufficientStock(
            `Not enough stock for ${insufficient.map((i) => `${i.name} (available: ${i.available})`).join(', ')}`,
            { products: insufficient }
          );
        }

        // 3. Customer check and customer type discount (BR-34, AC-48)
        let customer: {
          id: string;
          name: string;
          phone: string | null;
          type: CustomerType;
          creditLimit: Prisma.Decimal | null;
          outstandingBalance: Prisma.Decimal;
          gstId: string | null;
        } | null = null;
        let customerTypePct = 0;

        if (body.customerId) {
          customer = await tx.customer.findFirst({
            where: {
              id: body.customerId,
              businessId,
              active: true,
            },
            select: {
              id: true,
              name: true,
              phone: true,
              type: true,
              creditLimit: true,
              outstandingBalance: true,
              gstId: true,
            },
          });

          if (!customer) {
            throw AppError.notFound('Customer not found or inactive');
          }

          const discountConfig = await tx.customerTypeDiscount.findUnique({
            where: {
              businessId_customerType: {
                businessId,
                customerType: customer.type,
              },
            },
          });
          customerTypePct = discountConfig ? Number(discountConfig.discountPct) : 0;
        }

        // 4. Calculate totals with shared financial engine (BR-16, AC-29)
        const saleResult = computeSale({
          lines: body.lines.map((l) => {
            const p = productMap.get(l.productId)!;
            return {
              unitPrice: nuToChhertum(Number(p.sellPrice)),
              qty: l.qty,
              lineDiscount: nuToChhertum(l.lineDiscount || 0),
              taxRate: Number(p.taxRate.rate),
              taxMode: p.taxRate.mode,
              taxCategory: p.taxRate.category,
            };
          }),
          customerTypePct,
          billDiscount: body.billDiscount
            ? {
                type: body.billDiscount.type,
                value:
                  body.billDiscount.type === 'amount'
                    ? nuToChhertum(body.billDiscount.value)
                    : body.billDiscount.value,
              }
            : undefined,
          charges: nuToChhertum(body.charges || 0),
          gstRegistered: req.business!.gstRegistered,
        });

        const serverTotalNu = chhertumToNu(saleResult.total);

        if (body.expectedTotal !== undefined && Math.abs(body.expectedTotal - serverTotalNu) > 0.005) {
          throw AppError.priceChanged('Cart total does not match computed total', {
            serverTotal: serverTotalNu,
            expectedTotal: body.expectedTotal,
          });
        }

        // 5. Payment Validation (BR-17, BR-18, BR-19)
        let paymentSumChhertum = 0;
        let totalCreditChhertum = 0;
        const warnings: string[] = [];

        for (const pay of body.payments) {
          if (pay.amount <= 0) {
            throw AppError.badRequest('Payment amount must be greater than 0');
          }
          const payAmountCh = nuToChhertum(pay.amount);
          paymentSumChhertum += payAmountCh;

          if (pay.method === PaymentMethod.bank) {
            if (!pay.bankName?.trim() || !pay.journalNo?.trim()) {
              throw AppError.paymentDetailsRequired('Bank payment requires bank name and journal number');
            }
          } else if (
            ([
              PaymentMethod.mbob,
              PaymentMethod.mpay,
              PaymentMethod.dk_bank,
              PaymentMethod.tpay,
              PaymentMethod.other_wallet,
            ] as PaymentMethod[]).includes(pay.method)
          ) {
            if (!pay.journalNo?.trim()) {
              throw AppError.paymentDetailsRequired('Wallet payment requires transaction ID / journal number');
            }
          } else if (pay.method === PaymentMethod.cash) {
            if (pay.cashReceived !== undefined && pay.cashReceived !== null) {
              if (pay.cashReceived < pay.amount) {
                throw AppError.unprocessable('Cash received is less than the amount owed');
              }
            }
          } else if (pay.method === PaymentMethod.credit) {
            if (!customer) {
              throw AppError.creditRequiresCustomer('Select a customer before adding a credit payment');
            }
            totalCreditChhertum += payAmountCh;
          }
        }

        if (paymentSumChhertum !== saleResult.total) {
          throw AppError.paymentMismatch(
            `Payments (Nu. ${chhertumToNu(paymentSumChhertum)}) do not match total (Nu. ${serverTotalNu})`,
            { expected: serverTotalNu, provided: chhertumToNu(paymentSumChhertum) }
          );
        }

        // Credit limit check warning (BR-19, AC-32)
        if (customer && totalCreditChhertum > 0) {
          const creditNu = chhertumToNu(totalCreditChhertum);
          if (customer.creditLimit !== null && Number(customer.creditLimit) > 0) {
            if (Number(customer.outstandingBalance) + creditNu > Number(customer.creditLimit)) {
              warnings.push('CREDIT_LIMIT_EXCEEDED');
            }
          }
        }

        // Low stock warning check (BR-26)
        for (const [pId, requested] of qtyByProduct.entries()) {
          const p = productMap.get(pId)!;
          if (p.trackStock && p.stock - requested <= p.minStock && p.minStock > 0) {
            warnings.push('LOW_STOCK');
            break;
          }
        }

        // 6. Check Kitchen Order Billing state if linked (BR-27)
        if (body.kitchenOrderId) {
          const kot = await tx.kitchenOrder.findFirst({
            where: { id: body.kitchenOrderId, businessId },
          });
          if (!kot) {
            throw AppError.notFound('Kitchen order not found');
          }
          if (kot.billed || (kot.status !== 'ready' && kot.status !== 'served')) {
            throw AppError.notBillable('Kitchen order is already billed or not in ready/served status');
          }
        }

        // 7. Gapless Sequential Counter (BR-23)
        const { value: seq, formatted: invoiceNo } = await nextNumber(
          tx,
          businessId,
          CounterName.invoice,
          invoiceYear
        );

        // 8. Payment Summary String
        const distinctMethods = [...new Set(body.payments.map((p) => p.method))];
        const paymentSummary =
          distinctMethods.length === 1
            ? distinctMethods[0] === PaymentMethod.cash
              ? 'Cash'
              : distinctMethods[0] === PaymentMethod.card
                ? 'Card'
                : distinctMethods[0] === PaymentMethod.mbob
                  ? 'mBoB'
                  : distinctMethods[0] === PaymentMethod.mpay
                    ? 'mPay'
                    : distinctMethods[0] === PaymentMethod.dk_bank
                      ? 'DK Bank'
                      : distinctMethods[0] === PaymentMethod.tpay
                        ? 'TPay'
                        : distinctMethods[0] === PaymentMethod.other_wallet
                          ? 'Wallet'
                          : distinctMethods[0] === PaymentMethod.bank
                            ? 'Bank Transfer'
                            : 'Credit'
            : 'Split';

        // 9. Create Sale Record
        const sale = await tx.sale.create({
          data: {
            businessId,
            invoiceNo,
            invoiceYear,
            invoiceSeq: seq,
            status: SaleStatus.completed,
            businessDate,
            cashierId: employeeId,
            customerId: customer?.id ?? null,
            customerType: customer?.type ?? null,
            orderType: body.orderType,
            tableNo: body.tableNo || null,
            kitchenOrderId: body.kitchenOrderId || null,
            gstRegistered: req.business!.gstRegistered,
            subtotal: chhertumToNu(saleResult.subtotal),
            discountTotal: chhertumToNu(saleResult.discountTotal),
            customerTypePct: saleResult.allocation.customerTypePct,
            customerTypeAmt: chhertumToNu(saleResult.customerTypeDiscount),
            billDiscountType: body.billDiscount ? (body.billDiscount.type as BillDiscountType) : null,
            billDiscountValue: body.billDiscount ? body.billDiscount.value : 0,
            billDiscountAmt: chhertumToNu(saleResult.billDiscount),
            taxableAmount: chhertumToNu(saleResult.taxableAmount),
            taxAmount: chhertumToNu(saleResult.taxAmount),
            charges: chhertumToNu(saleResult.charges),
            total: serverTotalNu,
            amountPaid: chhertumToNu(paymentSumChhertum - totalCreditChhertum),
            creditAmount: chhertumToNu(totalCreditChhertum),
            paymentSummary,
          },
        });

        // 10. Create Sale Items
        for (let i = 0; i < saleResult.lines.length; i++) {
          const resLine = saleResult.lines[i]!;
          const reqLine = body.lines[i]!;
          const p = productMap.get(reqLine.productId)!;

          await tx.saleItem.create({
            data: {
              saleId: sale.id,
              businessId,
              lineNo: i + 1,
              productId: p.id,
              name: p.name,
              barcode: p.barcode,
              category: p.category,
              unitPrice: chhertumToNu(resLine.unitPrice),
              qty: resLine.qty,
              lineDiscount: chhertumToNu(resLine.lineDiscount),
              allocatedDiscount: chhertumToNu(resLine.allocatedDiscount),
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

        // 11. Deduct Stock & Create Stock Movements (BR-21, BR-25)
        for (const [pId, requested] of qtyByProduct.entries()) {
          const p = productMap.get(pId)!;
          if (p.trackStock) {
            const updated = await tx.product.update({
              where: { id: p.id },
              data: { stock: { decrement: requested } },
              select: { stock: true },
            });

            await tx.stockMovement.create({
              data: {
                businessId,
                productId: p.id,
                type: MovementType.sale,
                qty: requested,
                stockAfter: updated.stock,
                saleId: sale.id,
                createdBy: employeeId,
              },
            });
          }
        }

        // 12. Create Payments
        for (const pay of body.payments) {
          let changeGiven: number | null = null;
          if (pay.method === PaymentMethod.cash && pay.cashReceived !== undefined && pay.cashReceived !== null) {
            changeGiven = Math.round((pay.cashReceived - pay.amount) * 100) / 100;
          }

          await tx.payment.create({
            data: {
              businessId,
              kind: PaymentKind.sale,
              saleId: sale.id,
              method: pay.method,
              amount: pay.amount,
              cashReceived: pay.cashReceived ?? null,
              changeGiven,
              fee: pay.fee ?? 0,
              bankName: pay.bankName ?? null,
              journalNo: pay.journalNo ?? null,
              remarks: pay.remarks ?? null,
              status: PaymentStatus.completed,
              businessDate,
              createdBy: employeeId,
            },
          });
        }

        // 13. Update Customer's Total Spent & Outstanding Balance
        if (customer) {
          await tx.customer.update({
            where: { id: customer.id },
            data: {
              totalSpent: { increment: serverTotalNu },
              outstandingBalance: { increment: chhertumToNu(totalCreditChhertum) },
            },
          });
        }

        // 14. Mark Kitchen Order as Served & Billed
        if (body.kitchenOrderId) {
          await tx.kitchenOrder.update({
            where: { id: body.kitchenOrderId },
            data: {
              status: 'served',
              billed: true,
              saleId: sale.id,
            },
          });
        }

        // 15. Delete Held Order if Resumed
        if (body.heldOrderId) {
          await tx.heldOrder.deleteMany({
            where: { id: body.heldOrderId, businessId },
          });
        }

        // 16. Audit Log
        await writeAuditLog(
          {
            businessId,
            actorEmployeeId: employeeId,
            actorName: req.employee!.name,
            action: 'sale.completed',
            entityType: 'sale',
            entityId: sale.id,
            detail: `Invoice ${invoiceNo} completed for Nu. ${serverTotalNu}`,
          },
          tx
        );

        // 17. Return full sale formatted payload
        const fullSale = await tx.sale.findUniqueOrThrow({
          where: { id: sale.id },
          include: {
            cashier: { select: { id: true, name: true } },
            customer: { select: { id: true, name: true, phone: true, type: true, gstId: true } },
            items: { orderBy: { lineNo: 'asc' } },
            payments: true,
            voider: { select: { id: true, name: true } },
          },
        });

        return {
          statusCode: 201,
          data: {
            data: formatSaleResponse(fullSale),
            warnings,
          },
        };
      });
    }
  );

  res.status(result.statusCode).json(result.data);
});

/**
 * GET /sales
 * Invoices list with search, date range, status filters, and pagination.
 * Waiter: own sales only (07-API-SPEC.md §3.10).
 */
salesRouter.get('/', requirePermission('sales.view'), async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const employee = req.employee!;
  const { from, to, q, status, page = '1', limit = '50' } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const take = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
  const skip = (pageNum - 1) * take;

  const where: Prisma.SaleWhereInput = {
    businessId,
  };

  // Waiter can only see own sales per 07-API-SPEC.md §3.10
  if (employee.role === 'waiter') {
    where.cashierId = employee.id;
  }

  if (status && (status === 'completed' || status === 'voided')) {
    where.status = status as SaleStatus;
  }

  if (from || to) {
    where.completedAt = {};
    if (from && typeof from === 'string') {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        where.completedAt.gte = fromDate;
      }
    }
    if (to && typeof to === 'string') {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        where.completedAt.lte = toDate;
      }
    }
  }

  if (q && typeof q === 'string' && q.trim()) {
    const search = q.trim();
    where.OR = [
      { invoiceNo: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [total, sales] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      orderBy: { completedAt: 'desc' },
      skip,
      take,
      include: {
        cashier: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true, type: true } },
        voider: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  const items = sales.map((s) => ({
    id: s.id,
    invoiceNo: s.invoiceNo,
    completedAt: s.completedAt.toISOString(),
    businessDate: s.businessDate.toISOString().slice(0, 10),
    cashier: s.cashier,
    customer: s.customer,
    orderType: s.orderType,
    tableNo: s.tableNo,
    status: s.status,
    subtotal: Number(s.subtotal),
    discountTotal: Number(s.discountTotal),
    taxableAmount: Number(s.taxableAmount),
    taxAmount: Number(s.taxAmount),
    charges: Number(s.charges),
    total: Number(s.total),
    amountPaid: Number(s.amountPaid),
    creditAmount: Number(s.creditAmount),
    paymentSummary: s.paymentSummary,
    itemCount: s._count.items,
    voided:
      s.status === 'voided'
        ? {
            at: s.voidedAt?.toISOString() || s.completedAt.toISOString(),
            by: s.voider,
            reason: s.voidReason,
          }
        : null,
  }));

  res.json({
    data: items,
    meta: {
      total,
      page: pageNum,
      limit: take,
      pages: Math.ceil(total / take) || 1,
    },
  });
});

/**
 * GET /sales/:id
 * Retrieve single sale for receipt printing or inspection.
 */
salesRouter.get('/:id', requirePermission('sales.view'), async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const saleId = req.params.id as string;
  const employee = req.employee!;

  const where: Prisma.SaleWhereInput = {
    id: saleId,
    businessId,
  };

  // Waiter can only see own sales
  if (employee.role === 'waiter') {
    where.cashierId = employee.id;
  }

  const sale = await prisma.sale.findFirst({
    where,
    include: {
      cashier: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, phone: true, type: true, gstId: true } },
      items: { orderBy: { lineNo: 'asc' } },
      payments: true,
      voider: { select: { id: true, name: true } },
    },
  });

  if (!sale) {
    throw AppError.notFound('Sale not found');
  }

  res.json({ data: formatSaleResponse(sale) });
});

/**
 * POST /sales/:id/void
 * Void a completed sale per BR-24 (Admin / Manager only).
 */
salesRouter.post('/:id/void', requirePermission('sales.void'), async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const employeeId = req.employee!.id;
  const saleId = req.params.id as string;

  const parseResult = voidSaleSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw AppError.badRequest(parseResult.error.errors[0]?.message || 'Invalid void reason');
  }
  const { reason } = parseResult.data;

  const { updatedSale, voidWarnings } = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, businessId },
      include: {
        customer: true,
        items: true,
      },
    });

    if (!sale) {
      throw AppError.notFound('Sale not found');
    }

    if (sale.status === SaleStatus.voided) {
      throw AppError.alreadyVoided('Sale is already voided');
    }

    const now = new Date();

    // 1. Mark Sale as voided
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: SaleStatus.voided,
        voidedAt: now,
        voidedBy: employeeId,
        voidReason: reason,
      },
    });

    // 2. Restock tracked items with void_restock movements (BR-24, BR-25)
    for (const item of sale.items) {
      if (item.trackStock) {
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.qty } },
          select: { stock: true },
        });

        await tx.stockMovement.create({
          data: {
            businessId,
            productId: item.productId,
            type: MovementType.void_restock,
            qty: item.qty,
            stockAfter: updated.stock,
            saleId: sale.id,
            createdBy: employeeId,
          },
        });
      }
    }

    // 3. Mark sale's payments as voided
    await tx.payment.updateMany({
      where: { saleId: sale.id },
      data: {
        status: PaymentStatus.voided,
        voidedAt: now,
      },
    });

    // 4. Update Customer's total spent & outstanding balance
    const voidWarnings: string[] = [];
    if (sale.customerId && sale.customer) {
      const creditNu = Number(sale.creditAmount);
      const currentOutstanding = Number(sale.customer.outstandingBalance);
      const currentTotalSpent = Number(sale.customer.totalSpent);
      const newOutstanding = Math.max(0, currentOutstanding - creditNu);
      const newTotalSpent = Math.max(0, currentTotalSpent - Number(sale.total));

      if (creditNu > currentOutstanding) {
        voidWarnings.push('CUSTOMER_BALANCE_ALREADY_SETTLED');
      }

      await tx.customer.update({
        where: { id: sale.customerId },
        data: {
          totalSpent: newTotalSpent,
          outstandingBalance: newOutstanding,
        },
      });
    }

    // 5. Revert Kitchen Order billed flag (status stays served per BR-24)
    if (sale.kitchenOrderId) {
      await tx.kitchenOrder.update({
        where: { id: sale.kitchenOrderId },
        data: { billed: false },
      });
    }

    // 6. Write Audit Log
    await writeAuditLog(
      {
        businessId,
        actorEmployeeId: employeeId,
        actorName: req.employee!.name,
        action: 'sale.voided',
        entityType: 'sale',
        entityId: sale.id,
        detail: `Invoice ${sale.invoiceNo} voided. Reason: ${reason}`,
      },
      tx
    );

    // 7. Load updated sale
    const updated = await tx.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: {
        cashier: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true, type: true, gstId: true } },
        items: { orderBy: { lineNo: 'asc' } },
        payments: true,
        voider: { select: { id: true, name: true } },
      },
    });

    return { updatedSale: updated, voidWarnings };
  });

  res.json({
    data: formatSaleResponse(updatedSale),
    warnings: voidWarnings,
  });
});
