import fs from "node:fs";
import path from "node:path";
import type {Request, Response} from "express";
import ejs from "ejs";
import {
    Types,
    type CastError,
    type PipelineStage
} from "mongoose";
import {t} from "i18next";
import Orders from "../../models/orders";
import {createPDF} from "../../utils/helpers-pdf";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {getDirname} from "../../utils/get-file-url";
import {rejectResponse} from "../../utils/response";
import {EUserRoles} from "../../models/users";

/**
 *
 */
export interface IGetTargetInvoiceParameters {
    id?: string
}

/**
 * Get target invoice file and download it
 *
 * @param req
 * @param res
 */
export default async (req: Request & { params: IGetTargetInvoiceParameters }, res: Response) => {
    // if it's not valid it could throw an error
    if (!req.params.id || !Types.ObjectId.isValid(req.params.id)){
        rejectResponse(res, 404, t("ecommerce.order-not-found"))
        return
    }

    /**
     * Where build
     */
    const match: PipelineStage.Match = {
        $match: {}
    };
    // If user is NOT admin, it's limited to his own orders
    if (!req.user?.roles.includes(EUserRoles.ADMIN))
        match.$match.userId = req.user?._id;
    // single out the order
    match.$match._id = new Types.ObjectId(req.params.id);

    await Orders.getAll([match])
        .then((orders) => {
            if (orders.length === 0)
                return rejectResponse(res, 404, t("ecommerce.order-not-found"))
            const order = orders[0];
            /**
             * Create PDF file
             * Create PDF using get-target-order template OR pure HTML content
             * WARNING: Images and other link-related info will NOT work. Need to convert the images in base64 to embed them correctly in a PDF
             */
                // filename
            const invoiceName = order._id + '.pdf';
            // save path
            const invoicePath = path.join('src', 'storage', 'invoices', invoiceName);
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
            // Don't send emails in test environment (import.meta.url doesn't work anyway)
            if (process.env.NODE_ENV === "test")
                return;
            // Use an ejs template
            return ejs.renderFile(
                // Retrieve the template
                path.resolve(getDirname(import.meta.url), '../../../views/templates', 'invoice-order-file.ejs'),
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
                    if (error)
                        return rejectResponse(res, 500, error.message)
                    return createPDF(htmlContent, order._id + '.pdf', 'src/storage/invoices')
                        .then(() => {
                            /**
                             * Download file
                             */
                            // PRELOADING data
                            fs.readFile(invoicePath, (error, data) => {
                                if (error)
                                    return rejectResponse(res, 500, error.message)
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
            if (error.message == "404" || error.kind === "ObjectId")
                return rejectResponse(res, 404, t("ecommerce.order-not-found"))
            return rejectResponse(res, ...databaseErrorInterpreter(error))
        })
};