import path from 'node:path';
import type { Request, Response } from 'express';
import { t } from 'i18next';
import OrderService from '@services/orders';
import { rejectResponse } from '@utils/response';
import { userScope } from './_helpers';

/**
 * GET /orders/:id/invoice
 * Generate and return a PDF invoice for the order.
 */
const getOrderInvoice = async (request: Request, response: Response): Promise<void> => {
    const order = await OrderService.getById(String(request.params.id), userScope(request));
    if (!order) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.order-not-found')]);
        return;
    }

    try {
        const ejs = await import('ejs');
        const puppeteer = await import('puppeteer-core');

        const templatePath = path.resolve('views', 'templates-files', 'invoice-order-file.ejs');
        const html = await ejs.renderFile(templatePath, {
            order,
            pageMetaTitle: `Invoice - Order ${String(order._id)}`,
        });

        const browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
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
