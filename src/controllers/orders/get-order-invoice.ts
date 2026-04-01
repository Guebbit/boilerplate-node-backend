import path from 'node:path';
import type { Request, Response } from 'express';
import { t } from 'i18next';
import OrderService from '@services/orders';
import { rejectResponse } from '@utils/response';
import { userScope } from '@utils/helpers-scopes';
import ejs from "ejs";
import puppeteer from "puppeteer-core";

/**
 * GET /orders/:id/invoice
 * Generate and return a PDF invoice for the order.
 * Non-admin users can only access their own orders.
 *
 * WARNING: Images and other link-related resources will NOT work in the PDF.
 * To embed them, convert images to base64.
 */
const getOrderInvoice = (request: Request, response: Response): Promise<void> =>
    /**
     * Get order info from database
     * User role filters: Only admin can see all orders. Regular users can only see their own.
     */
    OrderService.getById(String(request.params.id), userScope(request))
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, 'Not Found', [ t('ecommerce.order-not-found') ]);
                return;
            }

            /**
             * Create PDF file using the invoice EJS template
             */
            const templatePath = path.resolve(
                'views',
                'templates-files',
                'invoice-order-file.ejs'
            );

            return ejs
                .renderFile(templatePath, {
                    order,
                    pageMetaTitle: `Invoice - Order ${ String(order._id) }`
                })
                .then((html) =>
                    /**
                     * Launch headless browser to render HTML → PDF
                     */
                    puppeteer
                        .launch({
                            executablePath:
                                process.env.PUPPETEER_EXECUTABLE_PATH ??
                                '/usr/bin/chromium-browser',
                            args: [ '--no-sandbox', '--disable-setuid-sandbox' ]
                        })
                        .then((browser) =>
                            browser
                                .newPage()
                                .then((page) =>
                                    page
                                        .setContent(html, { waitUntil: 'networkidle0' })
                                        .then(() => page.pdf({ format: 'A4' }))
                                )
                                .then((pdf) =>
                                    browser.close().then(() => {
                                        response
                                            .status(200)
                                            .setHeader('Content-Type', 'application/pdf')
                                            .setHeader(
                                                'Content-Disposition',
                                                `attachment; filename="invoice-${ String(order._id) }.pdf"`
                                            )
                                            .send(pdf);
                                    })
                                )
                        )
                );
        })
        .catch((error: Error) => {
            rejectResponse(response, 500, 'Invoice generation failed', [ error.message ]);
        });

export default getOrderInvoice;
