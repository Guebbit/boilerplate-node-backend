import path from 'node:path';
import type { Request, Response } from 'express';
import { t } from 'i18next';
import OrderService from '@services/orders';
import { rejectResponse } from '@utils/response';
import { userScope } from './helpers';

/**
 * GET /orders/:id/invoice
 * Generate and return a PDF invoice for the order.
 * Non-admin users can only access their own orders.
 *
 * WARNING: Images and other link-related resources will NOT work in the PDF.
 * To embed them, convert images to base64.
 */
const getOrderInvoice = async (request: Request, response: Response): Promise<void> => {
    /**
     * Get order info from database
     * User role filters: Only admin can see all orders. Regular users can only see their own.
     */
    const order = await OrderService.getById(String(request.params.id), userScope(request));
    if (!order) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.order-not-found')]);
        return;
    }

    try {
        const ejs = await import('ejs');
        const puppeteer = await import('puppeteer-core');

        /**
         * Create PDF file using the invoice EJS template
         */
        const templatePath = path.resolve('views', 'templates-files', 'invoice-order-file.ejs');
        const html = await ejs.renderFile(templatePath, {
            order,
            pageMetaTitle: `Invoice - Order ${String(order._id)}`,
        });

        /**
         * Launch headless browser to render HTML → PDF
         */
        const browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        // STREAMING: send data directly as bytes (alternative: preload to filesystem first)
        const pdf = await page.pdf({ format: 'A4' });
        await browser.close();

        response
            .status(200)
            .setHeader('Content-Type', 'application/pdf')
            .setHeader('Content-Disposition', `attachment; filename="invoice-${String(order._id)}.pdf"`)
            .send(pdf);
    } catch (error) {
        rejectResponse(response, 500, 'Invoice generation failed', [(error as Error).message]);
    }
};

export default getOrderInvoice;
