import fs from "node:fs";
import path from "node:path";
import type { Request, Response, NextFunction } from "express";
import ejs from "ejs";
import { t } from "i18next";
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
    const id = Number(request.params.orderId);
    if (!id || Number.isNaN(id))
        return next(new ExtendedError(t("ecommerce.order-not-found"), 404, true));

    // Build search filters
    const filters = { id: request.params.orderId };
    // If user is NOT admin, scope to their own orders only
    const scope = !request.session.user?.admin && request.session.user?.id
        ? { userId: request.session.user.id }
        : {};

    OrderService.search(filters, scope)
        .then(async (result) => {
            if (result.items.length === 0)
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));
            const order = result.items[0];
            /**
             * Create PDF file
             * Create PDF using get-target-order template OR pure HTML content
             * WARNING: Images and other link-related info will NOT work. Need to convert the images in base64 to embed them correctly in a PDF
             */
            const invoiceName = order.id + '.pdf'; // filename
            // save path
            const invoicePath = path.join('src', 'data', 'invoices', invoiceName);
            // // Direct HTML content (alternative)
            // const htmlContent = `
            //   <html>
            //   <head><title>${order.id}</title></head>
            //   <body>
            //     <ul>
            //         <li><b>Email</b>: ${order.email}</li>
            //         <li><b>Total Items</b>: ${order.totalItems}</li>
            //         <li><b>Total Quantity</b>: ${order.totalQuantity}</li>
            //         <li><b>Total Price</b>: ${order.totalPrice}/li>
            //     </ul>
            //   </body>
            //   </html>
            // `;
            // Use an ejs template
            try {
                const htmlContent = await ejs.renderFile(
                    // Retrieve the template
                    path.resolve(getDirname(import.meta.url), '../../../views/templates', 'invoice-order-file.ejs'),
                    // Populate the template
                    {
                        ...response.locals,
                        pageMetaTitle: 'Order',
                        pageMetaLinks: [
                            "/css/order-details.css",
                        ],
                        order,
                    },
                );
                await createPDF(htmlContent, order.id + '.pdf', 'src/data/invoices');
                /**
                 * Download file
                 */
                // PRELOADING data
                const data = await fs.promises.readFile(invoicePath);
                response.setHeader('Content-Type', 'application/pdf');
                response.setHeader('Content-Disposition', 'inline; filename="' + invoiceName + '"');
                // send data (with custom headers)
                response.send(data);
                // STREAMING data (alternative)
                // const file = fs.createReadStream(invoicePath);
                // response.setHeader('Content-Type', 'application/pdf');
                // response.setHeader('Content-Disposition', 'inline; filename="' + invoiceName + '"');
                // file.pipe(response);
            } catch (error) {
                return next(new ExtendedError((error as Error).message, 500));
            }
        })
        .catch((error: Error) => {
            if (error.message == "404")
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));
            return next(databaseErrorConverter(error));
        })
};
