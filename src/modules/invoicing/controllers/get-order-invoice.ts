/**
 * @module
 * PDF invoice controller. Renders synchronously on the request thread and streams the bytes back:
 * `200` once the order has been invoiced, `404` for an order that has none yet (never paid, or a
 * gap in the "gaps are acceptable" policy `orderNumber` already lives under) or does not exist at
 * all, `500` on a render failure (an `INSTALL_CHROMIUM=false` deployment, for one).
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '@modules/orders';
import { invoicingService } from '../services';
import { rejectResponse } from '@infrastructure/http/response';
import { isValidObjectId } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';
import { ERROR_CODES } from '@api/error-codes';

/** GET /orders/:id/invoice — the invoice PDF; non-admin callers see only their own order's. */
export const getOrderInvoice = (request: Request<{ id?: string }>, response: Response) => {
    // 404 on an unusable id, checked before the query for the reason `get-order-item.ts` (orders)
    // spells out: a malformed id would otherwise reject as a 422, not the 404 a lookup by id should
    // give.
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

            return invoicingService.findInvoiceForOrder(String(order._id)).then((invoice) => {
                if (!invoice) {
                    rejectResponse(response, 404, [
                        {
                            code: ERROR_CODES.ORDER_INVOICE_NOT_ISSUED,
                            message: t('invoicing.not-issued')
                        }
                    ]);
                    return undefined;
                }

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
            });
        })
        .catch(catchAs(response, 'Invoice generation failed'));
};
