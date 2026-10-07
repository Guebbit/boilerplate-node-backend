/**
 * @module
 * PDF credit-note controller — {@link import('./get-order-invoice').getOrderInvoice}'s twin: `200`
 * for a credit note of the order (a refund landed), `404` for one it does not have — never issued,
 * or another order's — or an order that does not exist, `500` on a render failure.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '@modules/orders';
import { invoicingService } from '../services';
import { rejectResponse } from '@infrastructure/http/response';
import { isValidObjectId, requireId } from '@infrastructure/http/ids';
import { catchAs } from '@infrastructure/http/controller';
import { ERROR_CODES } from '@api/error-codes';

/** The 404 for a credit note the order does not have — one answer for absent and someone else's. */
const notIssued = (response: Response): void => {
    rejectResponse(response, 404, [
        {
            code: ERROR_CODES.ORDER_CREDIT_NOTE_NOT_ISSUED,
            message: t('invoicing.credit-note-not-issued')
        }
    ]);
};

/** GET /orders/:id/credit-notes/:creditNoteId — the credit-note PDF; non-admin callers see only their own order's. */
export const getOrderCreditNote = (
    request: Request<{ id?: string; creditNoteId?: string }>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return;

    // Not checked up front like the order: an unknown credit note answers "not issued" only to a
    // caller who may see the order at all, and a malformed one must answer exactly that.
    const { creditNoteId } = request.params;

    return orderService
        .getForCaller(id, request.authContext)
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, [t('orders.not-found')]);
                return undefined;
            }
            if (!isValidObjectId(creditNoteId)) {
                notIssued(response);
                return undefined;
            }

            return invoicingService
                .findCreditNoteForOrderById(String(order._id), creditNoteId)
                .then((creditNote) => {
                    if (!creditNote) {
                        notIssued(response);
                        return undefined;
                    }

                    return invoicingService.renderCreditNotePdf(creditNote).then((pdf) => {
                        response
                            .status(200)
                            .setHeader('Content-Type', 'application/pdf')
                            .setHeader(
                                'Content-Disposition',
                                `inline; filename="credit-note-${creditNote.number}.pdf"`
                            )
                            .setHeader('Cache-Control', 'private, no-store')
                            .send(pdf);
                    });
                });
        })
        .catch(catchAs(response, 'Credit note generation failed'));
};
