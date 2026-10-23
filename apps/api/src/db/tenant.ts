import { PrismaClient, Prisma } from '@prisma/client';

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

export interface TenantContext {
  businessId: string;
  employeeId?: string;
  role?: string;
  plan?: string;
}

export const TENANT_MODELS = new Set<string>([
  'employee',
  'taxRate',
  'product',
  'stockMovement',
  'supplier',
  'purchase',
  'purchaseItem',
  'customer',
  'customerTypeDiscount',
  'sale',
  'saleItem',
  'payment',
  'counter',
  'kitchenOrder',
  'kitchenOrderItem',
  'heldOrder',
  'expense',
  'idempotencyKey',
  'subscription',
  'subscriptionEvent',
  'subscriptionPayment',
]);

/**
 * Creates a tenant-scoped Prisma Client extension that automatically enforces
 * businessId on all queries and mutations for tenant-owned models.
 *
 * If a query attempts to access another business's data or omit businessId in a
 * conflicting way, TenantScopeError is thrown.
 */
export function getTenantClient(
  prisma: PrismaClient,
  ctxOrBusinessId: TenantContext | string
) {
  const businessId =
    typeof ctxOrBusinessId === 'string'
      ? ctxOrBusinessId
      : ctxOrBusinessId?.businessId;

  if (!businessId || typeof businessId !== 'string' || businessId.trim() === '') {
    throw new TenantScopeError('businessId is required to construct a tenant-scoped database client');
  }

  const normalizedBusinessId = businessId.trim();

  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelName = model ? model.charAt(0).toLowerCase() + model.slice(1) : '';

          if (!TENANT_MODELS.has(modelName)) {
            return query(args);
          }

          const typedArgs = (args ?? {}) as Record<string, unknown>;

          // 1. Reads: findFirst, findFirstOrThrow, findMany, count, aggregate, groupBy
          if (
            [
              'findFirst',
              'findFirstOrThrow',
              'findMany',
              'count',
              'aggregate',
              'groupBy',
            ].includes(operation)
          ) {
            const where = (typedArgs.where ?? {}) as Record<string, unknown>;
            if (where.businessId !== undefined && where.businessId !== normalizedBusinessId) {
              throw new TenantScopeError(
                `Cross-tenant query rejected on ${model}: requested businessId does not match session (${normalizedBusinessId})`
              );
            }
            where.businessId = normalizedBusinessId;
            typedArgs.where = where;
            return query(typedArgs);
          }

          // 2. findUnique & findUniqueOrThrow
          if (['findUnique', 'findUniqueOrThrow'].includes(operation)) {
            const where = (typedArgs.where ?? {}) as Record<string, unknown>;

            // Check if compound unique key has businessId
            for (const key of Object.keys(where)) {
              const val = where[key];
              if (
                val &&
                typeof val === 'object' &&
                'businessId' in (val as Record<string, unknown>)
              ) {
                const compKey = val as Record<string, unknown>;
                if (compKey.businessId !== normalizedBusinessId) {
                  throw new TenantScopeError(
                    `Cross-tenant findUnique rejected on ${model}: compound key businessId does not match session (${normalizedBusinessId})`
                  );
                }
              }
            }

            if (where.businessId !== undefined && where.businessId !== normalizedBusinessId) {
              throw new TenantScopeError(
                `Cross-tenant findUnique rejected on ${model}: requested businessId does not match session (${normalizedBusinessId})`
              );
            }

            // If where is queried by id or single key without businessId, redirect to findFirst with tenant scope
            if (!where.businessId) {
              const targetDelegate = (prisma as unknown as Record<string, Record<string, ((a: unknown) => Promise<unknown>) | undefined>>)[modelName];
              if (targetDelegate && typeof targetDelegate.findFirst === 'function') {
                const scopedWhere = { ...where, businessId: normalizedBusinessId };
                const result = await targetDelegate.findFirst({ ...typedArgs, where: scopedWhere });
                if (!result && operation === 'findUniqueOrThrow') {
                  throw new Prisma.PrismaClientKnownRequestError(
                    `No ${model} found for tenant ${normalizedBusinessId}`,
                    { code: 'P2025', clientVersion: '6.x' }
                  );
                }
                return result;
              }
            }

            return query(typedArgs);
          }

          // 3. Create
          if (operation === 'create') {
            const data = (typedArgs.data ?? {}) as Record<string, unknown>;
            if (data.businessId !== undefined && data.businessId !== normalizedBusinessId) {
              throw new TenantScopeError(
                `Cross-tenant create rejected on ${model}: data businessId does not match session (${normalizedBusinessId})`
              );
            }
            data.businessId = normalizedBusinessId;
            typedArgs.data = data;
            return query(typedArgs);
          }

          // 4. CreateMany
          if (operation === 'createMany') {
            const data = typedArgs.data;
            if (Array.isArray(data)) {
              for (const item of data) {
                if (item && typeof item === 'object') {
                  if (item.businessId !== undefined && item.businessId !== normalizedBusinessId) {
                    throw new TenantScopeError(
                      `Cross-tenant createMany rejected on ${model}: item businessId does not match session (${normalizedBusinessId})`
                    );
                  }
                  item.businessId = normalizedBusinessId;
                }
              }
            }
            return query(typedArgs);
          }

          // 5. Update, UpdateMany, Delete, DeleteMany
          if (['update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
            const where = (typedArgs.where ?? {}) as Record<string, unknown>;
            if (where.businessId !== undefined && where.businessId !== normalizedBusinessId) {
              throw new TenantScopeError(
                `Cross-tenant ${operation} rejected on ${model}: where businessId does not match session (${normalizedBusinessId})`
              );
            }

            // On update/delete by ID, ensure tenant ownership first to prevent cross-tenant mutations
            if (['update', 'delete'].includes(operation) && where.id && !where.businessId) {
              const targetDelegate = (prisma as unknown as Record<string, Record<string, ((a: unknown) => Promise<unknown>) | undefined>>)[modelName];
              if (targetDelegate && typeof targetDelegate.findFirst === 'function') {
                const existing = await targetDelegate.findFirst({
                  where: { id: where.id, businessId: normalizedBusinessId },
                  select: { id: true },
                });
                if (!existing) {
                  throw new TenantScopeError(
                    `Cross-tenant ${operation} rejected on ${model}: record ${where.id} does not belong to tenant ${normalizedBusinessId}`
                  );
                }
              }
            }

            where.businessId = normalizedBusinessId;
            typedArgs.where = where;
            return query(typedArgs);
          }

          // 6. Upsert
          if (operation === 'upsert') {
            const where = (typedArgs.where ?? {}) as Record<string, unknown>;
            const createData = (typedArgs.create ?? {}) as Record<string, unknown>;
            const updateData = (typedArgs.update ?? {}) as Record<string, unknown>;

            if (where.businessId !== undefined && where.businessId !== normalizedBusinessId) {
              throw new TenantScopeError(
                `Cross-tenant upsert rejected on ${model}: where businessId does not match session (${normalizedBusinessId})`
              );
            }
            if (createData.businessId !== undefined && createData.businessId !== normalizedBusinessId) {
              throw new TenantScopeError(
                `Cross-tenant upsert rejected on ${model}: create businessId does not match session (${normalizedBusinessId})`
              );
            }
            if (updateData.businessId !== undefined && updateData.businessId !== normalizedBusinessId) {
              throw new TenantScopeError(
                `Cross-tenant upsert rejected on ${model}: update businessId does not match session (${normalizedBusinessId})`
              );
            }

            createData.businessId = normalizedBusinessId;
            typedArgs.create = createData;
            return query(typedArgs);
          }

          return query(typedArgs);
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof getTenantClient>;
