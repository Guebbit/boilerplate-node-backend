import fs from "fs";
import path from "path";
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
import { ExtendedError } from "../../utils/error-helpers";


/**
 *
 */
export interface IGetTargetInvoiceParameters {
    orderId: string
}

/**
 * Get target invoice file and download it
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request & { params: IGetTargetInvoiceParameters }, res: Response, next: NextFunction) => {
    // if it's not valid it could throw an error
    if(!Types.ObjectId.isValid(req.params.orderId))
        return next(new ExtendedError(t("ecommerce.order-not-found"), 404, ""));

    /**
     * Where build (same as get-target-order.ts
     */
    const match: PipelineStage.Match = {
            $match: {}
        };
    if(!req.session.user?.admin)
        match.$match.userId = req.session.user?._id;
    match.$match._id = new Types.ObjectId(req.params.orderId);

    Orders.getAll([match])
        .then((orders) => {
            if (orders.length < 1)
                return next(new ExtendedError("404", 404, t("ecommerce.order-not-found")));
            const order = orders[0];
            /**
             * Create PDF file
             * Create PDF using get-target-order template OR pure HTML content
             * WARNING: Images and other link-related info will NOT work. Need to convert the images in base64 to embed them correctly in a PDF
             */
            // filename
            const invoiceName = order._id + '.pdf';
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
            ejs.renderFile(
                // Retrieve the template
                path.resolve(__dirname, '../../../views/templates', 'invoice-order-file.ejs'),
                // Populate the template
                {
                    ...res.locals,
                    pageMetaTitle: 'Order',
                    pageMetaLinks: [
                        "/css/order-details.css",
                    ],
                    order,
                },
                // callback
                async (error: Error | null, htmlContent: string) => {
                    if(error)
                        throw error;
                    return createPDF(htmlContent, order._id + '.pdf', 'src/data/invoices')
                        .then(() => {
                            /**
                             * Download file
                             */
                            // PRELOADING data
                            fs.readFile(invoicePath, (err, data) => {
                                if(err)
                                    throw err;
                                // return next(new ExtendedError("500", 500, err.message, false))M
                                res.setHeader('Content-Type', 'application/pdf');
                                res.setHeader('Content-Disposition', 'inline; filename="' + invoiceName + '"');
                                // send data (with custom headers)
                                res.send(data);
                            });
                            // STREAMING data (alternative)
                            // const file = fs.createReadStream(invoicePath);
                            // res.setHeader('Content-Type', 'application/pdf');
                            // res.setHeader('Content-Disposition', 'inline; filename="' + invoiceName + '"');
                            // file.pipe(res);
                        })
                })
        })
        .catch((error: CastError) => {
            if(error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError(t("ecommerce.order-not-found"), 404, ""));
            return next(new ExtendedError(error.kind, parseInt(error.message), "", false));
        })
};