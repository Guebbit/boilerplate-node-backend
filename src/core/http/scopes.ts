/**
 * Query scoping — the authorization boundary for data reads.
 */

import type { Request } from 'express';
// `Types` holds Mongoose's BSON types; `Types.ObjectId` is needed because aggregation
// pipelines do *not* apply schema casting the way `find()` does (see below).
import { Types } from 'mongoose';

/**
 * Helper: build a $match scope that restricts non-admin users to their own orders.
 *
 * Returns a filter fragment to merge into a query/aggregation, or `undefined` for admins —
 * meaning "no restriction", so the caller must spread it rather than treat it as a filter:
 *   `{ ...userScope(request), status: 'paid' }`
 *
 * Two details that matter:
 *  - `new Types.ObjectId(...)` is explicit because `$match` inside an aggregation pipeline
 *    compares raw BSON: a plain string id would silently match nothing, which here would look
 *    like "no orders" rather than an error.
 *  - the `?? ''` fallback makes an *invalid* ObjectId, so `new Types.ObjectId('')` throws.
 *    That is the safe direction to fail: a request with no auth context errors out instead of
 *    quietly widening the scope to every user's data.
 */
export const userScope = (request: Request): Record<string, unknown> | undefined =>
    // `authContext` is attached by the auth middleware; `?.` covers unauthenticated requests.
    request.authContext?.admin
        ? undefined
        : {
              userId: new Types.ObjectId(request.authContext?.id ?? '')
          };
