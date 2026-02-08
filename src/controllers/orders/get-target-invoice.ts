import fs from "node:fs";
import path from "node:path";
import type { Request, Response, NextFunction } from "express";
import ejs from "ejs";
import {
    Types,
    type CastError,
    type PipelineStage
} from "mongoose";
import { t } from "i18next";
import Orders from "../../models/orders";
import { createPDF } from "../../utils/pdf-helpers";
import {databaseErrorConverter, ExtendedError} from "../../utils/error-helpers";
import { getDirname } from "../../utils/get-file-url";


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
export const getTargetInvoice = (request: Request & { params: IGetTargetInvoiceParameters }, response: Response, next: NextFunction) => {
    // if it's not valid it could throw an error
    if(!Types.ObjectId.isValid(request.params.orderId))
        return next(new ExtendedError(t("ecommerce.order-not-found"), 404, true));

    /**
     * Where build (same as get-target-order.ts
     */
    const match: PipelineStage.Match = {
            $match: {}
        };
    if(!request.session.user?.admin)
        match.$match.userId = request.session.user?._id;
    match.$match._id = new Types.ObjectId(request.params.orderId);

    Orders.getAll([match])
        .then((orders) => {
            if (orders.length === 0)
                return next(new ExtendedError("404", 404, true, [t("ecommerce.order-not-found")]));
            const order = orders[0];
            /**
             * Create PDF file
             * Create PDF using get-target-order template OR pure HTML content
             * WARNING: Images and other link-related info will NOT work. Need to convert the images in base64 to embed them correctly in a PDF
             */
            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            const invoiceName = order._id + '.pdf'; // filename
            // save path
            const invoicePath = path.join('src', 'data', 'invoices', invoiceName);
            // // Direct HTML content (alternative)
            // const htmlContent = `
            //   <html>
            //   <head><title>${order._id}</title></head>
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
            return ejs.renderFile(
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
                // callback
                async (error: Error | null, htmlContent: string) => {
                    if(error)
                        return next(new ExtendedError(error.message, 500));
                    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                    return createPDF(htmlContent, order._id + '.pdf', 'src/data/invoices')
                        .then(() => {
                            /**
                             * Download file
                             */
                            // PRELOADING data
                            fs.readFile(invoicePath, (error_, data) => {
                                if(error_)
                                    return next(new ExtendedError(error_.message, 500));
                                response.setHeader('Content-Type', 'application/pdf');
                                response.setHeader('Content-Disposition', 'inline; filename="' + invoiceName + '"');
                                // send data (with custom headers)
                                response.send(data);
                            });
                            // STREAMING data (alternative)
                            // const file = fs.createReadStream(invoicePath);
                            // response.setHeader('Content-Type', 'application/pdf');
                            // response.setHeader('Content-Disposition', 'inline; filename="' + invoiceName + '"');
                            // file.pipe(response);
                        })
                })
        })
        .catch((error: CastError) => {
            if(error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError("404", 404, true, [t("ecommerce.order-not-found")]));
            return next(databaseErrorConverter(error));
        })
};