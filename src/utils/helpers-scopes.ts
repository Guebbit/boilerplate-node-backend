import type { Request } from 'express';

/**
 * Helper: build a scope that restricts non-admin users to their own orders.
 */
export const userScope = (request: Request): Record<string, unknown> | undefined =>
    request.user?.admin
        ? undefined
        : {
              userId: Number(request.user?.id)
          };
