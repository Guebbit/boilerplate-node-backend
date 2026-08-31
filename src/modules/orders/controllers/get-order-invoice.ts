/**
 * @module
 * PDF invoice controller — renders the order through the shared EJS template and
 * `renderHtmlToPdf`, the same render `adapters/pdf.worker.ts` reuses outside a request.
 */

import path from 'node:path';
import type { Request, Response } from 'express';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { orderService } from '../service';
import { invoiceDocument } from '../emails';
import { rejectResponse } from '@infrastructure/http/response';
import ejs from 'ejs';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';
import { isValidObjectId } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';

/**
 * GET /orders/:id/invoice — PDF invoice for the order; non-admin callers see only their own.
 * WARNING: image/link resources will not render in the PDF — embed images as base64 instead.
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

            // ejs.renderFile: compiles the template file against the given locals into HTML.
            return ejs
                .renderFile(
                    path.resolve('shared', 'views', 'templates-files', 'orders.invoice.ejs'),
                    // Same convention as the email templates: the copy is resolved here, in the
                    // request's language, and the template only interpolates. That is what lets
                    // the identical render run from `adapters/pdf.worker.ts`, where there is no
                    // request and no locale to resolve against.
                    invoiceDocument(request.locale ?? getDefaultLocale(), order)
                )
                .then((html) => renderHtmlToPdf(html))
                .then((pdf) => {
                    response
                        .status(200)
                        .setHeader('Content-Type', 'application/pdf')
                        .setHeader(
                            'Content-Disposition',
                            `attachment; filename="invoice-${orderId}.pdf"`
                        )
                        .send(pdf);
                });
        })
        .catch(catchAs(response, 'Invoice generation failed'));
};
