import path from 'node:path';
import type { Request, Response } from 'express';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { orderService } from '../service';
import type { OrderDocument } from '../model';
import { invoiceDocument } from '../emails';
import { rejectResponse } from '@infrastructure/http/response';
import ejs from 'ejs';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';
import { isValidObjectId } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';

/**
 * GET /orders/:id/invoice
 * Generate and return a PDF invoice for the order.
 * Non-admin users can only access their own orders.
 *
 * WARNING: Images and other link-related resources will NOT work in the PDF.
 * To embed them, convert images to base64.
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
             * every non-admin. The cast is what `OrderDocument` cannot say: it omits `id`, the
             * house convention for a type that describes the STORED shape, and the wire `id`
             * arrives from the virtual on one branch and the transform on the other.
             */
            const orderId = String((order as OrderDocument & { id?: string }).id ?? order._id);

            /**
             * Create PDF file using the invoice EJS template
             */
            return ejs
                .renderFile(
                    path.resolve('shared', 'views', 'templates-files', 'orders.invoice.ejs'),
                    // Same convention as the email templates: the copy is resolved here, in the
                    // request's language, and the template only interpolates. That is what lets
                    // the identical render run from `workers/pdf.worker.ts`, where there is no
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
