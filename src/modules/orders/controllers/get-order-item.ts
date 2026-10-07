/**
 * @module
 * Single-order read controller, scoped by caller role. A malformed id is checked before the
 * query and answers the same 404 as an unknown one.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '../services';
import { rejectResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { catchAs } from '@infrastructure/http/controller';
import { setEtag } from '@infrastructure/http/preconditions';
import { recordStaffRead } from '@kernel/staff-read';
import { ordersAuditActions } from '../audit';
import { respondWithOrder } from './respond';

/**
 * GET /orders/:id — single order by path id; non-admin callers see only their own.
 *
 * The id is checked BEFORE the query (`requireId`): a malformed id and an unknown one answer the
 * same 404.
 */
export const getOrderItem = (
    request: Request<{ id?: string }>,
    response: Response
): Promise<void> | void => {
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return;

    return orderService
        .getForCaller(id, request.authContext)
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, [t('orders.not-found')]);
                return;
            }
            recordStaffRead(request, {
                key: 'orders.any.read',
                action: ordersAuditActions.ADMIN_ORDER_VIEWED,
                targetType: 'order',
                targetId: id,
                ownerId: String(order.userId)
            });
            // The version an edit sends back as `If-Match`.
            setEtag(response, order);
            // The body carries what THIS caller may do to the order, so the client renders its
            // controls from the server's answer rather than from a copy of the lifecycle.
            return respondWithOrder(response, order, request.authContext, 'getOrderItem');
        })
        .catch(catchAs(response, 'getOrderItem'));
};
