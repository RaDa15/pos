import { z } from 'zod';

export const PrototypeImportSchema = z
  .object({
    app: z.string().min(1),
    version: z.number().int().min(1),
    business: z
      .object({
        name: z.string().optional(),
        type: z.string().optional(),
        ownerName: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional().nullable(),
        gstNo: z.string().optional().nullable(),
        logo: z.string().optional().nullable(),
      })
      .passthrough(),
    collections: z
      .object({
        taxrates: z.array(z.record(z.unknown())).optional().default([]),
        users: z.array(z.record(z.unknown())).optional().default([]),
        products: z.array(z.record(z.unknown())).optional().default([]),
        inventory: z.array(z.record(z.unknown())).optional().default([]),
        customers: z.array(z.record(z.unknown())).optional().default([]),
        suppliers: z.array(z.record(z.unknown())).optional().default([]),
        expenses: z.array(z.record(z.unknown())).optional().default([]),
        transactions: z.array(z.record(z.unknown())).optional().default([]),
        payments: z.array(z.record(z.unknown())).optional().default([]),
        counters: z.array(z.record(z.unknown())).optional().default([]),
        orders: z.array(z.record(z.unknown())).optional().default([]),
        auditLogs: z.array(z.record(z.unknown())).optional().default([]),
        heldOrders: z.array(z.record(z.unknown())).optional().default([]),
        pricing: z.array(z.record(z.unknown())).optional().default([]),
      })
      .passthrough(),
  })
  .passthrough();

export type PrototypeImportPayload = z.infer<typeof PrototypeImportSchema>;
