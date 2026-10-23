import { Router, Request, Response } from 'express';
import { prisma } from '../db/client.js';
import {
  requireEmployee,
  requirePermission,
  requireActiveSubscription,
  requirePlanFeature,
} from '../middleware/auth.js';
import { stringifyCsv } from '../lib/csv.js';
import { PaymentKind, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';

export const paymentsRouter: Router = Router();

paymentsRouter.use(requireEmployee);
paymentsRouter.use(requireActiveSubscription);
paymentsRouter.use(requirePermission('payments.view'));
paymentsRouter.use(requirePlanFeature('payment_reports'));

/**
 * Supported payment methods for reporting.
 */
const ALL_METHODS: PaymentMethod[] = [
  PaymentMethod.cash,
  PaymentMethod.card,
  PaymentMethod.mbob,
  PaymentMethod.mpay,
  PaymentMethod.dk_bank,
  PaymentMethod.tpay,
  PaymentMethod.other_wallet,
  PaymentMethod.bank,
  PaymentMethod.credit,
];

/**
 * GET /payments
 * Payment reconciliation report with method totals, credit, settlements, and records.
 * Reference: docs/02-BUSINESS-RULES.md BR-31, AC-46, 07-API-SPEC.md §3.12.
 */
paymentsRouter.get('/', async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const { from, to, method, kind, page = '1', limit = '50' } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const take = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
  const skip = (pageNum - 1) * take;

  // Base date filter condition
  const dateFilter: Prisma.PaymentWhereInput = {};
  if (from && typeof from === 'string') {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) {
      dateFilter.createdAt = { ...(dateFilter.createdAt as Prisma.DateTimeFilter), gte: fromDate };
    }
  }
  if (to && typeof to === 'string') {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) {
      dateFilter.createdAt = { ...(dateFilter.createdAt as Prisma.DateTimeFilter), lte: toDate };
    }
  }

  // 1. Fetch completed payments in range for aggregation cards (BR-31: completed only!)
  const completedPayments = await prisma.payment.findMany({
    where: {
      businessId,
      status: PaymentStatus.completed,
      ...dateFilter,
    },
    select: {
      method: true,
      kind: true,
      amount: true,
    },
  });

  // Calculate method breakdown (excluding credit per BR-31)
  const methodMap = new Map<PaymentMethod, { amount: number; count: number }>();
  for (const m of ALL_METHODS) {
    if (m !== PaymentMethod.credit) {
      methodMap.set(m, { amount: 0, count: 0 });
    }
  }

  let onCreditAmount = 0;
  let onCreditCount = 0;
  let settlementsAmount = 0;
  let settlementsCount = 0;
  let totalReceived = 0;

  for (const p of completedPayments) {
    const amt = Number(p.amount);

    if (p.method === PaymentMethod.credit) {
      // Credit lines shown separately as "On credit" (BR-31)
      onCreditAmount += amt;
      onCreditCount += 1;
    } else {
      // Money received
      totalReceived += amt;
      const current = methodMap.get(p.method) || { amount: 0, count: 0 };
      current.amount += amt;
      current.count += 1;
      methodMap.set(p.method, current);
    }

    if (p.kind === PaymentKind.credit_settlement) {
      // Settlements count as money received on the day they're paid
      settlementsAmount += amt;
      settlementsCount += 1;
    }
  }

  const totalsByMethod = Array.from(methodMap.entries()).map(([m, val]) => ({
    method: m,
    amount: Math.round(val.amount * 100) / 100,
    count: val.count,
  }));

  // 2. Fetch paginated records table with user-applied filters
  const recordsWhere: Prisma.PaymentWhereInput = {
    businessId,
    ...dateFilter,
  };

  if (method && typeof method === 'string' && method in PaymentMethod) {
    recordsWhere.method = method as PaymentMethod;
  }

  if (kind && (kind === PaymentKind.sale || kind === PaymentKind.credit_settlement)) {
    recordsWhere.kind = kind as PaymentKind;
  }

  const [totalRecords, paymentRows] = await Promise.all([
    prisma.payment.count({ where: recordsWhere }),
    prisma.payment.findMany({
      where: recordsWhere,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        creator: { select: { id: true, name: true } },
        sale: {
          select: {
            id: true,
            invoiceNo: true,
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
        customer: { select: { id: true, name: true, phone: true } },
      },
    }),
  ]);

  const records = paymentRows.map((r) => {
    const referenceNo =
      r.kind === PaymentKind.sale
        ? r.sale?.invoiceNo || 'N/A'
        : r.receiptNo || 'CR-0000';

    const customerName = r.sale?.customer?.name || r.customer?.name || null;
    const customerId = r.sale?.customer?.id || r.customer?.id || null;

    return {
      id: r.id,
      kind: r.kind,
      referenceNo,
      saleId: r.saleId,
      customerId,
      customerName,
      method: r.method,
      amount: Number(r.amount),
      fee: Number(r.fee),
      bankName: r.bankName,
      journalNo: r.journalNo,
      remarks: r.remarks,
      status: r.status,
      businessDate: r.businessDate.toISOString().slice(0, 10),
      createdAt: r.createdAt.toISOString(),
      voidedAt: r.voidedAt?.toISOString() || null,
      createdBy: r.creator,
    };
  });

  const responsePayload = {
    totalsByMethod,
    totalReceived: Math.round(totalReceived * 100) / 100,
    onCredit: {
      amount: Math.round(onCreditAmount * 100) / 100,
      count: onCreditCount,
    },
    settlementsTotal: {
      amount: Math.round(settlementsAmount * 100) / 100,
      count: settlementsCount,
    },
    records,
    meta: {
      total: totalRecords,
      page: pageNum,
      limit: take,
      pages: Math.ceil(totalRecords / take) || 1,
    },
  };

  res.json({
    data: responsePayload,
    ...responsePayload,
  });
});

/**
 * GET /payments/export.csv
 * Export payments table to CSV (RFC-4180).
 * Columns: Date, Time, Invoice/Receipt, Method, Amount, Fee, Bank, JournalNo, Remarks, CreatedBy, Status
 */
paymentsRouter.get('/export.csv', async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const { from, to, method, kind } = req.query;

  const where: Prisma.PaymentWhereInput = {
    businessId,
  };

  if (from && typeof from === 'string') {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) {
      where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter), gte: fromDate };
    }
  }
  if (to && typeof to === 'string') {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) {
      where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter), lte: toDate };
    }
  }

  if (method && typeof method === 'string' && method in PaymentMethod) {
    where.method = method as PaymentMethod;
  }

  if (kind && (kind === PaymentKind.sale || kind === PaymentKind.credit_settlement)) {
    where.kind = kind as PaymentKind;
  }

  const rows = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      creator: { select: { name: true } },
      sale: { select: { invoiceNo: true } },
    },
  });

  const headers = [
    'Date',
    'Time',
    'Invoice/Receipt',
    'Method',
    'Amount',
    'Fee',
    'Bank',
    'JournalNo',
    'Remarks',
    'CreatedBy',
    'Status',
  ];

  const data = rows.map((r) => {
    const d = new Date(r.createdAt);
    const dateStr = d.toISOString().slice(0, 10);
    const timeStr = d.toTimeString().slice(0, 8);
    const ref = r.kind === PaymentKind.sale ? r.sale?.invoiceNo || 'N/A' : r.receiptNo || 'N/A';

    return [
      dateStr,
      timeStr,
      ref,
      r.method.toUpperCase(),
      Number(r.amount).toFixed(2),
      Number(r.fee).toFixed(2),
      r.bankName || '',
      r.journalNo || '',
      r.remarks || '',
      r.creator.name,
      r.status.toUpperCase(),
    ];
  });

  const csv = stringifyCsv(headers, data);

  const filename = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});
