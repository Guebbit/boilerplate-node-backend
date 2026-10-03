/**
 * @module
 * GET /orders/:id/credit-notes — the list a client picks a download from. One row per refund that
 * settled on the order, `[]` for an order never refunded, `404` for an order the caller cannot see.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '@modules/orders';
import { invoicingService } from '../services';
import { presentCreditNoteSummary } from '../presenter';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { catchAs } from '@infrastructure/http/controller';
import type { CreditNoteSummary } from '@types';

/** GET /orders/:id/credit-notes — non-admin callers see only their own order's. */
export const getOrderCreditNotes = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return;

    return orderService
        .getById(id, orderService.callerScope(request.authContext))
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, [t('orders.not-found')]);
                return undefined;
            }

            return invoicingService.findCreditNotesForOrder(String(order._id)).then((notes) => {
                successResponse<CreditNoteSummary[]>(
                    response,
                    notes.map((note) => presentCreditNoteSummary(note)),
                    200
                );
            });
        })
        .catch(catchAs(response, 'getOrderCreditNotes'));
};
