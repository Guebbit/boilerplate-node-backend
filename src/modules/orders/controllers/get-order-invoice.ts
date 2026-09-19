/**
 * @module
 * PDF invoice controller. `invoicePdfStatus === 'ready'` streams the stored PDF
 * `transport/invoice-pdf.ts`'s worker already wrote — the only render path there is. `'pending'`
 * answers 202: the client polls the order and retries once it reads `ready`. Absent entirely (an
 * order that predates the async pipeline), or `ready` with nothing on disk (a data anomaly), both
 * self-heal the same way: `enqueueInvoicePdfRetry` queues a render and this also answers 202 —
 * never a render on the request thread.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '../services';
import { readStoredInvoicePdf, enqueueInvoicePdfRetry } from '../transport/invoice-pdf';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { isValidObjectId } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';

/** Sends a stored PDF's bytes. */
const sendStoredInvoice = (response: Response, orderId: string, pdf: Buffer) =>
    response
        .status(200)
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="invoice-${orderId}.pdf"`)
        .send(pdf);

/** The 202 every not-yet-rendered case answers with — queued already, or just (re)queued here. */
const answerPending = (response: Response) =>
    successResponse(response, { invoicePdfStatus: 'pending' as const }, 202, t('orders.invoice-pending'));

/**
 * GET /orders/:id/invoice — PDF invoice for the order; non-admin callers see only their own.
 */
export const getOrderInvoice = (request: Request<{ id?: string }>, response: Response) => {
    // 404 on an unusable id, and checked before the query for the reason `get-order-item.ts`
    // spells out: the two role branches raise different error classes for it.
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

            /*
             * `id`, not `_id`. `getById` is polymorphic by scope (see `findByIdScoped`): an admin
             * gets a hydrated document, an owner gets a transformed plain object whose `_id` the
             * serializer deleted. `id` is the half that resolves on both — reading `_id` here put
             * the literal string `undefined` in the filename and in the document's own title for
             * every non-admin. The cast widens `order`'s own type rather than naming the stored
             * one: the STORED shape omits `id` by house convention, and the wire `id` arrives from
             * the virtual on one branch and the transform on the other — so what is being added
             * here is knowledge about the wire, which is this layer's business.
             */
            const orderId = String((order as typeof order & { id?: string }).id ?? order._id);

            if (order.invoicePdfStatus === 'pending') {
                answerPending(response);
                return undefined;
            }

            if (order.invoicePdfStatus !== 'ready')
                return enqueueInvoicePdfRetry(orderId).then(() => answerPending(response));

            return readStoredInvoicePdf(orderId).then((pdf) =>
                pdf
                    ? sendStoredInvoice(response, orderId, pdf)
                    : enqueueInvoicePdfRetry(orderId).then(() => answerPending(response))
            );
        })
        .catch(catchAs(response, 'Invoice generation failed'));
};
