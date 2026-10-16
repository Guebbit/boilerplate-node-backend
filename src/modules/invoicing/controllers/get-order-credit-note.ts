/**
 * @module
 * PDF credit-note controller — {@link import('./get-order-invoice').getOrderInvoice}'s twin: `200`
 * for a credit note of the order (a refund landed), `404` for one it does not have — never issued,
 * or another order's — or an order that does not exist, `500` on a render failure.
 */

import type { Request, Response } from 'express';
import { buyerIdOf } from '@modules/orders';
import { invoicingService } from '../services';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { recordStaffRead } from '@kernel/staff-read';
import { invoicingAuditActions } from '../audit';

/** GET /orders/:id/credit-notes/:creditNoteId — the credit-note PDF; non-admin callers see only their own order's, and staff need the payments staff read. */
export const getOrderCreditNote = (
    request: Request<{ id?: string; creditNoteId?: string }>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return;

    return invoicingService
        .creditNoteForCaller(
            id,
            request.params.creditNoteId,
            request.authContext,
            callerContextOf(request)
        )
        .then((result) => {
            if (refused(response, result)) return undefined;
            const { document: creditNote, order } = result.data;

            recordStaffRead(request, {
                key: 'display:Order',
                action: invoicingAuditActions.ADMIN_CREDIT_NOTE_VIEWED,
                targetType: 'credit_note',
                // The row id, not the number: it repeats across the invoice series.
                targetId: String(creditNote._id),
                ownerId: buyerIdOf(order)
            });

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
        })
        .catch(catchAs(response, 'Credit note generation failed'));
};
