import type { Request } from 'express';
import { Types } from 'mongoose';

/**
 * Helper: build a $match scope that restricts non-admin users to their own orders.
 */
export const userScope = (request: Request): Record<string, unknown> | undefined =>
    request.user?.admin
        ? undefined
        : { userId: new Types.ObjectId((request.user?._id as Types.ObjectId).toString()) };
