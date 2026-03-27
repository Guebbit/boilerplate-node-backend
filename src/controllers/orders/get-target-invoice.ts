import fs from "node:fs";
import path from "node:path";
import type { Request, Response, NextFunction } from "express";
import ejs from "ejs";
import { t } from "i18next";
import type { IOrder } from "@models/orders";
import OrderService from "@services/orders";
import { createPDF } from "@utils/pdf-helpers";
import { databaseErrorConverter, ExtendedError } from "@utils/error-helpers";
import { getDirname } from "@utils/get-file-url";

/**
 *
 */
export interface IGetTargetInvoiceParameters {
    orderId: string
}

/**
 * Get target invoice file and download it
 *
 * @param request
 * @param response
 * @param next
 */
export const getTargetInvoice = (request: Request & {
    params: IGetTargetInvoiceParameters
}, response: Response, next: NextFunction) => {
    const orderId = Number(request.params.orderId);
    if (!orderId || Number.isNaN(orderId))
        return next(new ExtendedError(t("ecommerce.order-not-found"), 404, true));

    const where: Partial<IOrder> = { id: orderId };
    if (!request.session.user?.admin && request.session.user?.id)
        where.userId = request.session.user.id;

    OrderService.getAll(where)
        .then(async (orders) => {
            if (orders.length === 0)
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));
            const order = orders[0] as Record<string, unknown>;

            const invoiceName = String(order['id']) + '.pdf';
            const invoicePath = path.join('src', 'storage', 'invoices', invoiceName);

            try {
                const htmlContent = await ejs.renderFile(
                    path.resolve(getDirname(import.meta.url), '../../views/template-emails', 'invoice-order-file.ejs'),
                    {
                        ...response.locals,
                        pageMetaTitle: 'Order',
                        pageMetaLinks: [
                            "/css/order-details.css",
                        ],
                        order,
                    },
                );

                await createPDF(htmlContent, String(order['id']) + '.pdf', 'src/storage/invoices');

                const data = await fs.promises.readFile(invoicePath);
                response.setHeader('Content-Type', 'application/pdf');
                response.setHeader('Content-Disposition', 'inline; filename="' + invoiceName + '"');
                response.send(data);
            } catch (error) {
                return next(new ExtendedError((error as Error).message, 500));
            }
        })
        .catch((error: Error) => next(databaseErrorConverter(error)));
};
