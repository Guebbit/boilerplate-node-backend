/**
 * @module
 * The order-controller success tail, shared by every write and the single-order read: hydrate the
 * order the service handed back with this caller's `actions`, then answer with it. Kept out of
 * `services/scope.ts` on purpose — `withActions` stays framework-free, and the `Response`/status
 * split is where these controllers genuinely differ (create's 201, cancel's message), so only the
 * hydrate-then-send shape is shared; each call site still states its own status and message.
 */

import type { Response } from 'express';
import { orderService } from '../services';
import type { AuthContext, Order } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';

/**
 * The document type `withActions` accepts, derived rather than imported from `../model` — a
 * controller may not hold a persistence handle (`no-persistence-imports`).
 */
type OrderForResponse = Parameters<typeof orderService.withActions>[0];

/**
 * Hydrate `order` with `authContext`'s `actions` and send it as the success envelope.
 *
 * Owns its own `.catch`, with the SAME operation name each call site already passes its own
 * chain's final `.catch` — `withActions` failing is exactly as much this operation's failure as
 * the service call that preceded it, so both must log under one name, not two.
 *
 * @param response - the express response
 * @param order - the order document the service handed back
 * @param authContext - whose actions to compute, from `request.authContext`
 * @param context - the operation name for `catchAs`, matching this controller's own outer `.catch`
 * @param status - HTTP status, forwarded to `successResponse` (200 by default)
 * @param message - an optional message alongside the order
 */
export const respondWithOrder = (
    response: Response,
    order: OrderForResponse,
    authContext: AuthContext | undefined,
    context: string,
    status?: number,
    message?: string
): Promise<void> =>
    orderService
        .withActions(order, authContext)
        .then((resolved) => {
            successResponse<Order>(response, resolved, status, message);
        })
        .catch(catchAs(response, context));
