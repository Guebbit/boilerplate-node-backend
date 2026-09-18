/**
 * @module
 * PDF invoice controller. `invoicePdfStatus === 'ready'` streams the stored PDF
 * `transport/invoice-pdf.ts`'s worker already wrote — faster, and the canonical source now.
 * `'pending'` answers 202: the client polls the order and retries once it reads `ready`. Absent
 * entirely (an order that predates the async pipeline) falls back to rendering it here, on the
 * request, through the same shared EJS template the worker renders outside one — exactly how
 * every order's invoice worked before that pipeline existed.
 */

import path from 'node:path';
import type { Request, Response } from 'express';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { orderService } from '../services';
import { invoiceDocument } from '../emails';
import { readStoredInvoicePdf } from '../transport/invoice-pdf';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import ejs from 'ejs';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';
import { isValidObjectId } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';

/**
 * Sends a stored PDF's bytes with the same headers the synchronous render answers with, so a
 * client cannot tell which path served it.
 */
const sendStoredInvoice = (response: Response, orderId: string, pdf: Buffer) =>
    response
        .status(200)
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="invoice-${orderId}.pdf"`)
        .send(pdf);

/**
 * Renders the invoice on the request, the way every order did before the async pipeline existed —
 * the fallback for an order whose `invoicePdfStatus` is absent.
 *
 * The render locale is the DOWNLOADER's own language, unlike `transport/invoice-pdf.ts`'s worker,
 * which has no request to read one from and uses the order's own frozen locale instead — two
 * different documents by design: this path really does run inside a request.
 * WARNING: image/link resources will not render in the PDF — embed images as base64 instead.
 */
const renderInvoiceInline = (
    response: Response,
    request: Request,
    orderId: string,
    order: Parameters<typeof invoiceDocument>[1]
) =>
    // ejs.renderFile: compiles the template file against the given locals into HTML.
    ejs
        .renderFile(
            path.resolve('shared', 'templates', 'documents', 'orders.invoice.ejs'),
            invoiceDocument(request.locale ?? getDefaultLocale(), order)
        )
        .then((html) => renderHtmlToPdf(html))
        .then((pdf) => sendStoredInvoice(response, orderId, Buffer.from(pdf)));

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
                return;
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
                successResponse(
                    response,
                    { invoicePdfStatus: 'pending' as const },
                    202,
                    t('orders.invoice-pending')
                );
                return undefined;
            }

            if (order.invoicePdfStatus !== 'ready')
                return renderInvoiceInline(response, request, orderId, order);

            return readStoredInvoicePdf(orderId).then((pdf) =>
                // `ready` with nothing on disk shouldn't happen, but rendering rather than 500ing
                // keeps the customer's download working while whatever wrote the status wrong
                // gets investigated.
                pdf
                    ? sendStoredInvoice(response, orderId, pdf)
                    : renderInvoiceInline(response, request, orderId, order)
            );
        })
        .catch(catchAs(response, 'Invoice generation failed'));
};
