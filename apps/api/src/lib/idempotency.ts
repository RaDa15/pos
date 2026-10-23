import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';

export interface IdempotencyResult<T> {
  statusCode: number;
  data: T;
  replayed: boolean;
}

/**
 * Executes an action with idempotency key caching.
 * If key is provided and already exists for this business, returns the stored response.
 * Otherwise executes the action and stores the result.
 */
export async function withIdempotency<T>(
  businessId: string,
  employeeId: string,
  key: string | undefined,
  route: string,
  execute: () => Promise<{ statusCode: number; data: T }>
): Promise<IdempotencyResult<T>> {
  if (!key) {
    const result = await execute();
    return { ...result, replayed: false };
  }

  // Check if this idempotency key was already completed
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      businessId_key: {
        businessId,
        key,
      },
    },
  });

  if (existing) {
    return {
      statusCode: existing.statusCode,
      data: existing.response as T,
      replayed: true,
    };
  }

  // Execute the operation
  const result = await execute();

  // Save the result for future replays
  try {
    await prisma.idempotencyKey.create({
      data: {
        businessId,
        key,
        employeeId,
        route,
        statusCode: result.statusCode,
        response: result.data as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // If concurrent insert happened, ignore error
    console.warn(`Idempotency key insert race condition for ${key}:`, err);
  }

  return { ...result, replayed: false };
}
