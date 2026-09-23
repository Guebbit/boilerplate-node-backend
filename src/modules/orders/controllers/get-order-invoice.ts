/**
 * @module
 * PDF invoice controller. Renders synchronously on the request thread — `orderService.
 * renderInvoicePdf` — and streams the bytes back: `200` every time an order exists and the caller
 * may see it, `404` otherwise, `500` on a render failure (an `INSTALL_CHROMIUM=false` deployment,
 * for one). No `202`, no polling: the invoice is a view of the order, not a durable artefact with
 * a status of its own.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '../services';
import { rejectResponse } from '@infrastructure/http/response';
import { isValidObjectId } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';

/**
 * GET /orders/:id/invoice — PDF invoice for the order; non-admin callers see only their own.
 */
export const getOrderInvoice = (request: Request<{ id?: string }>, response: Response) => {
    // 404 on an unusable id, checked before the query for the reason `get-order-item.ts` spells
    // out: a malformed id would otherwise reject as a 422, not the 404 a lookup by id should give.
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

            const orderId = String(order._id);

            return orderService.renderInvoicePdf(orderId).then((pdf) => {
                // Hard-deleted between the read above and the render — vanishingly unlikely, but
                // the render's own `findByIdRaw` is a second, independent lookup that can miss.
                if (!pdf) {
                    rejectResponse(response, 404, [t('orders.not-found')]);
                    return undefined;
                }

                return (
                    response
                        .status(200)
                        .setHeader('Content-Type', 'application/pdf')
                        // `inline`, not `attachment`: the frontend holds the blob either way and
                        // decides what to do with it — download, or a same-tab preview.
                        .setHeader(
                            'Content-Disposition',
                            `inline; filename="invoice-${order.invoiceNumber ?? orderId}.pdf"`
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
