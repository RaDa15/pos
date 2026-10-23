import { Router, Request, Response } from 'express';
import { CounterName, CustomerType, PaymentKind, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { requireEmployee, requirePermission, requirePlanFeature } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import {
  CreateCustomerRequestSchema,
  UpdateCustomerRequestSchema,
  CreateCreditSettlementRequestSchema,
  isCustomerTypeAllowed,
} from '@pos/shared';
import { writeAuditLog } from '../lib/audit.js';
import { nextNumber } from '../lib/counters.js';
import { withIdempotency } from '../lib/idempotency.js';

export const customersRouter: Router = Router();

// Gated by employee login and Plan: Professional for all customer routes
customersRouter.use(requireEmployee);
customersRouter.use(requirePlanFeature('customers'));

/**
 * GET /customers?search=&type=&active=&page=&limit=
 * List customers with header totals: { outstandingTotal, customersWithBalance }.
 */
customersRouter.get(
  '/',
  requirePermission('customers.view'),
  async (req: Request, res: Response) => {
    const { search, type, active } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {
      businessId: req.business!.id,
    };

    if (active !== undefined && active !== '') {
      where.active = active === 'true' || active === '1';
    }

    if (type && typeof type === 'string' && Object.values(CustomerType).includes(type as CustomerType)) {
      where.type = type as CustomerType;
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { gstId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [customers, total, allBalances] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: [{ outstandingBalance: 'desc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.customer.count({ where }),
      // Calculate header totals for all customers in this business
      prisma.customer.findMany({
        where: { businessId: req.business!.id },
        select: { outstandingBalance: true },
      }),
    ]);

    let outstandingTotal = 0;
    let customersWithBalance = 0;
    for (const c of allBalances) {
      const bal = parseFloat(c.outstandingBalance.toString());
      if (bal > 0) {
        outstandingTotal += bal;
        customersWithBalance++;
      }
    }

    res.json({
      data: customers.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        phone: c.phone,
        email: c.email,
        address: c.address,
        gstId: c.gstId,
        creditLimit: c.creditLimit ? parseFloat(c.creditLimit.toString()) : null,
        totalSpent: parseFloat(c.totalSpent.toString()),
        outstandingBalance: parseFloat(c.outstandingBalance.toString()),
        notes: c.notes,
        active: c.active,
        createdAt: c.createdAt.toISOString(),
      })),
      headerTotals: {
        outstandingTotal: Math.round(outstandingTotal * 100) / 100,
        customersWithBalance,
      },
      meta: {
        page,
        limit,
        total,
      },
    });
  }
);

/**
 * POST /customers
 * Create a new customer.
 */
customersRouter.post(
  '/',
  requirePermission('customers.manage'),
  async (req: Request, res: Response) => {
    const body = CreateCustomerRequestSchema.parse(req.body);

    // BR-35: Validate customer type against business type
    if (!isCustomerTypeAllowed(req.business!.type, body.type)) {
      throw AppError.validationError(
        `Customer type "${body.type}" is not allowed for ${req.business!.type} businesses (BR-35).`
      );
    }

    const customer = await prisma.customer.create({
      data: {
        businessId: req.business!.id,
        name: body.name,
        phone: body.phone || null,
        email: body.email || null,
        address: body.address || null,
        gstId: body.gstId || null,
        type: body.type,
        creditLimit: body.creditLimit !== undefined && body.creditLimit !== null ? body.creditLimit : null,
        notes: body.notes || null,
      },
    });

    await writeAuditLog({
      businessId: req.business!.id,
      actorEmployeeId: req.employee!.id,
      actorName: req.employee!.name,
      action: 'customer_created',
      entityType: 'customer',
      entityId: customer.id,
      detail: `Created customer "${customer.name}" (${customer.type})`,
    });

    res.status(201).json({
      data: {
        id: customer.id,
        name: customer.name,
        type: customer.type,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        gstId: customer.gstId,
        creditLimit: customer.creditLimit ? parseFloat(customer.creditLimit.toString()) : null,
        totalSpent: parseFloat(customer.totalSpent.toString()),
        outstandingBalance: parseFloat(customer.outstandingBalance.toString()),
        notes: customer.notes,
        active: customer.active,
        createdAt: customer.createdAt.toISOString(),
      },
    });
  }
);

/**
 * PATCH /customers/:id
 * Edit customer details or deactivate/activate.
 */
customersRouter.patch(
  '/:id',
  requirePermission('customers.manage'),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const body = UpdateCustomerRequestSchema.parse(req.body);

    const existing = await prisma.customer.findFirst({
      where: { id, businessId: req.business!.id },
    });

    if (!existing) {
      throw AppError.notFound('Customer not found.');
    }

    // BR-35: Validate customer type against business type if updating type
    if (body.type && !isCustomerTypeAllowed(req.business!.type, body.type)) {
      throw AppError.validationError(
        `Customer type "${body.type}" is not allowed for ${req.business!.type} businesses (BR-35).`
      );
    }

    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        phone: body.phone !== undefined ? (body.phone || null) : undefined,
        email: body.email !== undefined ? (body.email || null) : undefined,
        address: body.address !== undefined ? (body.address || null) : undefined,
        gstId: body.gstId !== undefined ? (body.gstId || null) : undefined,
        type: body.type,
        creditLimit: body.creditLimit !== undefined ? body.creditLimit : undefined,
        notes: body.notes !== undefined ? (body.notes || null) : undefined,
        active: body.active !== undefined ? body.active : undefined,
      },
    });

    await writeAuditLog({
      businessId: req.business!.id,
      actorEmployeeId: req.employee!.id,
      actorName: req.employee!.name,
      action: 'customer_updated',
      entityType: 'customer',
      entityId: updated.id,
      detail: `Updated customer "${updated.name}"`,
    });

    res.json({
      data: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        phone: updated.phone,
        email: updated.email,
        address: updated.address,
        gstId: updated.gstId,
        creditLimit: updated.creditLimit ? parseFloat(updated.creditLimit.toString()) : null,
        totalSpent: parseFloat(updated.totalSpent.toString()),
        outstandingBalance: parseFloat(updated.outstandingBalance.toString()),
        notes: updated.notes,
        active: updated.active,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  }
);

/**
 * GET /customers/:id/history
 * Sales invoices and credit settlement payment records for this customer.
 */
customersRouter.get(
  '/:id/history',
  requirePermission('customers.view'),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const customer = await prisma.customer.findFirst({
      where: { id, businessId: req.business!.id },
    });

    if (!customer) {
      throw AppError.notFound('Customer not found.');
    }

    const [sales, settlements] = await Promise.all([
      prisma.sale.findMany({
        where: { customerId: customer.id, businessId: req.business!.id },
        orderBy: { completedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          invoiceNo: true,
          status: true,
          total: true,
          completedAt: true,
          businessDate: true,
          payments: {
            select: {
              method: true,
              amount: true,
            },
          },
        },
      }),
      prisma.payment.findMany({
        where: {
          customerId: customer.id,
          businessId: req.business!.id,
          kind: PaymentKind.credit_settlement,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          receiptNo: true,
          method: true,
          amount: true,
          bankName: true,
          journalNo: true,
          remarks: true,
          status: true,
          createdAt: true,
          creator: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    res.json({
      data: {
        customer: {
          id: customer.id,
          name: customer.name,
          type: customer.type,
          phone: customer.phone,
          creditLimit: customer.creditLimit ? parseFloat(customer.creditLimit.toString()) : null,
          totalSpent: parseFloat(customer.totalSpent.toString()),
          outstandingBalance: parseFloat(customer.outstandingBalance.toString()),
        },
        sales: sales.map((s) => {
          let paid = 0;
          let credit = 0;
          for (const p of s.payments) {
            const amt = parseFloat(p.amount.toString());
            if (p.method === 'credit') {
              credit += amt;
            } else {
              paid += amt;
            }
          }
          return {
            id: s.id,
            invoiceNo: s.invoiceNo,
            status: s.status,
            total: parseFloat(s.total.toString()),
            paid: Math.round(paid * 100) / 100,
            credit: Math.round(credit * 100) / 100,
            completedAt: s.completedAt.toISOString(),
          };
        }),
        settlements: settlements.map((set) => ({
          id: set.id,
          receiptNo: set.receiptNo,
          method: set.method,
          amount: parseFloat(set.amount.toString()),
          bankName: set.bankName,
          journalNo: set.journalNo,
          remarks: set.remarks,
          status: set.status,
          createdAt: set.createdAt.toISOString(),
          receivedBy: set.creator ? set.creator.name : 'System',
        })),
      },
    });
  }
);

/**
 * POST /customers/:id/settlements
 * Receive credit payment (settlement) against outstanding balance (BR-20, AC-49).
 */
customersRouter.post(
  '/:id/settlements',
  requirePermission('customers.settle'),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const body = CreateCreditSettlementRequestSchema.parse(req.body);

    const customer = await prisma.customer.findFirst({
      where: { id, businessId: req.business!.id },
    });

    if (!customer) {
      throw AppError.notFound('Customer not found.');
    }

    const currentBalance = parseFloat(customer.outstandingBalance.toString());

    // BR-20 & AC-49: Settlement must be > 0 and <= customer's outstanding balance
    if (body.amount > currentBalance) {
      throw AppError.settlementExceedsBalance(
        `Settlement amount Nu. ${body.amount.toFixed(2)} exceeds customer's outstanding balance of Nu. ${currentBalance.toFixed(2)} (BR-20).`,
        {
          requested: body.amount,
          balance: currentBalance,
        }
      );
    }

    const result = await withIdempotency(
      req.business!.id,
      req.employee!.id,
      idempotencyKey,
      `/customers/${id}/settlements`,
      async () => {
        const txResult = await prisma.$transaction(async (tx) => {
          // Re-fetch customer inside transaction with row lock
          const lockedCustomer = await tx.customer.findUniqueOrThrow({
            where: { id: customer.id },
          });

          const lockedBalance = parseFloat(lockedCustomer.outstandingBalance.toString());
          if (body.amount > lockedBalance) {
            throw AppError.settlementExceedsBalance(
              `Settlement amount Nu. ${body.amount.toFixed(2)} exceeds customer's outstanding balance of Nu. ${lockedBalance.toFixed(2)} (BR-20).`,
              {
                requested: body.amount,
                balance: lockedBalance,
              }
            );
          }

          // Generate sequential CR-NNNN receipt number
          const nextReceipt = await nextNumber(tx, req.business!.id, CounterName.credit_settlement);

          // Create payment record
          const payment = await tx.payment.create({
            data: {
              businessId: req.business!.id,
              kind: PaymentKind.credit_settlement,
              customerId: customer.id,
              receiptNo: nextReceipt.formatted,
              method: body.method as PaymentMethod,
              amount: body.amount,
              bankName: body.bankName || null,
              journalNo: body.journalNo || null,
              remarks: body.remarks || null,
              status: PaymentStatus.completed,
              businessDate: new Date(),
              createdBy: req.employee!.id,
            },
          });

          // Decrement customer's outstanding balance
          const updatedCustomer = await tx.customer.update({
            where: { id: customer.id },
            data: {
              outstandingBalance: {
                decrement: body.amount,
              },
            },
          });

          // Audit log
          await writeAuditLog(
            {
              businessId: req.business!.id,
              actorEmployeeId: req.employee!.id,
              actorName: req.employee!.name,
              action: 'credit_settlement',
              entityType: 'payment',
              entityId: payment.id,
              detail: `Received Nu. ${body.amount.toFixed(2)} from ${customer.name} via ${body.method.toUpperCase()} (${nextReceipt.formatted}). New balance: Nu. ${parseFloat(updatedCustomer.outstandingBalance.toString()).toFixed(2)}`,
            },
            tx
          );

          return {
            payment,
            updatedCustomer,
          };
        });

        return {
          statusCode: 201,
          data: {
            payment: {
              id: txResult.payment.id,
              receiptNo: txResult.payment.receiptNo,
              method: txResult.payment.method,
              amount: parseFloat(txResult.payment.amount.toString()),
              bankName: txResult.payment.bankName,
              journalNo: txResult.payment.journalNo,
              remarks: txResult.payment.remarks,
              status: txResult.payment.status,
              createdAt: txResult.payment.createdAt.toISOString(),
            },
            customer: {
              id: txResult.updatedCustomer.id,
              name: txResult.updatedCustomer.name,
              outstandingBalance: parseFloat(txResult.updatedCustomer.outstandingBalance.toString()),
            },
          },
        };
      }
    );

    res.status(result.statusCode).json({ data: result.data });
  }
);
