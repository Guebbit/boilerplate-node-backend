import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { cartService } from '../services';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { cartAuditActions } from '../audit';
import {
    emitAnalyticsEvent,
    analyticsEvents,
    buildAnalyticsBase
} from '@infrastructure/observability/analytics';

/**
 * POST /cart/reorder/:orderId
 * Copy one of the caller's own orders back into their cart.
 *
 * Filed under cart because of what it writes: the order is only read. Lines whose product has
 * since left the public catalogue are skipped — the response's cart view is the honest record of
 * what landed — and an order with nothing left to add answers 409 rather than a hollow 200.
 */
export const postReorder = (request: Request<{ orderId: string }>, response: Response) => {
    if (!request.authContext) {
        rejectResponse(response, 401);
        return;
    }
    const userId = request.authContext.id;
    const { orderId } = request.params;

    return cartService
        .reorderIntoCart(userId, orderId)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }

            emitAuditEvent(
                buildAuditEvent(request, {
                    action: cartAuditActions.USER_CART_REORDERED,
                    outcome: 'success',
                    metadata: { order_id: orderId }
                })
            );
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: analyticsEvents.CART_REORDERED,
                properties: { order_id: orderId }
            });

            successResponse(response, result.data, 200, result.message);
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'postReorder', error);
        });
};
