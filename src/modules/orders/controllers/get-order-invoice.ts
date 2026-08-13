import path from 'node:path';
import type { Request, Response } from 'express';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { orderService } from '../service';
import { invoiceDocument } from '../emails';
import { rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import ejs from 'ejs';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';

/**
 * GET /orders/:id/invoice
 * Generate and return a PDF invoice for the order.
 * Non-admin users can only access their own orders.
 *
 * WARNING: Images and other link-related resources will NOT work in the PDF.
 * To embed them, convert images to base64.
 */
export const getOrderInvoice = (request: Request, response: Response) =>
    orderService
        .getById(String(request.params.id), orderService.callerScope(request.authContext))
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, [t('orders.not-found')]);
                return;
            }

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
                            `attachment; filename="invoice-${String(order._id)}.pdf"`
                        )
                        .send(pdf);
                });
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'Invoice generation failed', error);
        });
