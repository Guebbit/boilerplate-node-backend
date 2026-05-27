import path from 'node:path';
import type { Request, Response } from 'express';
import { t } from 'i18next';
import { orderService } from '@services/orders';
import { rejectResponse } from '@utils/response';
import { userScope } from '@utils/helpers-scopes';
import ejs from 'ejs';
import { renderHtmlToPdf } from '@utils/helpers-pdf';

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
        .getById(String(request.params.id), userScope(request))
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, 'Not Found', [t('ecommerce.order-not-found')]);
                return;
            }

            /**
             * Create PDF file using the invoice EJS template
             */
            return ejs
                .renderFile(path.resolve('views', 'templates-files', 'invoice-order-file.ejs'), {
                    order,
                    pageMetaTitle: `Invoice - Order ${String(order._id)}`
                })
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
            rejectResponse(response, 500, 'Invoice generation failed', [error.message]);
        });
