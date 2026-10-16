/**
 * @module
 * PDF invoice controller. Serves the stored PDF, or renders it on the request thread when none
 * is stored, and streams the bytes back:
 * `200` once the order has been invoiced, `404` for an order that has none yet (never paid, or a
 * failed freeze, which never rolls back the payment) or does not exist at all, `500` on a render
 * failure (an `INSTALL_CHROMIUM=false` deployment, for one).
 */

import type { Request, Response } from 'express';
import { buyerIdOf } from '@modules/orders';
import { invoicingService } from '../services';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import { recordStaffRead } from '@kernel/staff-read';
import { invoicingAuditActions } from '../audit';

/** GET /orders/:id/invoice — the invoice PDF; non-admin callers see only their own order's. */
export const getOrderInvoice = (request: Request<{ id?: string }>, response: Response) => {
    // An unusable id answers as the unknown order it is, before the query.
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return;

    return invoicingService
        .invoiceForCaller(id, request.authContext)
        .then((result) => {
            if (refused(response, result)) return undefined;
            const { document: invoice, order } = result.data;

            recordStaffRead(request, {
                key: 'display:Order',
                action: invoicingAuditActions.ADMIN_INVOICE_VIEWED,
                targetType: 'invoice',
                // The row id, not the number: the invoice and credit-note series both restart
                // at 1 each year, and `GET /audit?target=` filters on `targetId` alone.
                targetId: String(invoice._id),
                ownerId: buyerIdOf(order)
            });

            return invoicingService.renderInvoicePdf(invoice).then((pdf) =>
                response
                    .status(200)
                    .setHeader('Content-Type', 'application/pdf')
                    // `inline`, not `attachment`: the frontend holds the blob either way and
                    // decides what to do with it — download, or a same-tab preview.
                    .setHeader(
                        'Content-Disposition',
                        `inline; filename="invoice-${invoice.number}.pdf"`
                    )
                    // Personal and financial data — never a shared/CDN cache, and never the
                    // browser's own disk cache either.
                    .setHeader('Cache-Control', 'private, no-store')
                    .send(pdf)
            );
        })
        .catch(catchAs(response, 'Invoice generation failed'));
};
