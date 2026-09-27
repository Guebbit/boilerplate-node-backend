/**
 * @module
 * PDF credit-note controller — {@link import('./get-order-invoice').getOrderInvoice}'s twin: `200`
 * once a credit note has been issued for the order (a refund landed), `404` for an order with none
 * (never refunded, or no invoice to reverse in the first place) or that does not exist, `500` on a
 * render failure.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '@modules/orders';
import { invoicingService } from '../services';
import { rejectResponse } from '@infrastructure/http/response';
import { isValidObjectId } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';

/** GET /orders/:id/credit-note — the credit-note PDF; non-admin callers see only their own order's. */
export const getOrderCreditNote = (request: Request<{ id?: string }>, response: Response) => {
    if (!isValidObjectId(request.params.id)) {
        rejectResponse(response, 404, [t('orders.not-found')]);
        return;
    }

    return orderService
        .getById(request.params.id, orderService.callerScope(request.authContext))
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, [t('orders.not-found')]);
                return undefined;
            }

            return invoicingService.findCreditNoteForOrder(String(order._id)).then((creditNote) => {
                if (!creditNote) {
                    rejectResponse(response, 404, [
                        {
                            code: 'ORDER_CREDIT_NOTE_NOT_ISSUED',
                            message: t('invoicing.credit-note-not-issued')
                        }
                    ]);
                    return undefined;
                }

                return invoicingService
                    .renderCreditNotePdf(creditNote)
                    .then((pdf) =>
                        response
                            .status(200)
                            .setHeader('Content-Type', 'application/pdf')
                            .setHeader(
                                'Content-Disposition',
                                `inline; filename="credit-note-${creditNote.number}.pdf"`
                            )
                            .setHeader('Cache-Control', 'private, no-store')
                            .send(pdf)
                    );
            });
        })
        .catch(catchAs(response, 'Credit note generation failed'));
};
