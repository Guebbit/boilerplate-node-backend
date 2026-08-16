import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { orderService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { ordersAuditActions } from '../audit';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { ordersAnalyticsEvents } from '../analytics';

/**
 * POST /orders/:id/cancel
 * Cancel an order — the one order write a customer can make.
 *
 * The service's conditional write carries the caller's scope, so a non-admin can only cancel an
 * order they can see (their own, not soft-deleted) and only from `pending`. An admin cancels
 * anyone's — the same privilege the admin status write already grants, spelled as the same
 * endpoint the customer uses.
 */
export const postCancelOrder = (request: Request<{ id?: string }>, response: Response) =>
    orderService
        .cancelById(String(request.params.id), request.authContext)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }

            emitAuditEvent(
                buildAuditEvent(request, {
                    action: ordersAuditActions.USER_ORDER_CANCELLED,
                    outcome: 'success',
                    metadata: { order_id: String(request.params.id) }
                })
            );
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: ordersAnalyticsEvents.ORDER_CANCELLED,
                properties: { order_id: String(request.params.id) }
            });

            successResponse(response, result.data, 200, result.message);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'postCancelOrder', error);
        });
