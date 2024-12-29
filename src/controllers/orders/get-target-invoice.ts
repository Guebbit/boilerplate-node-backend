import fs from "node:fs";
import path from "node:path";
import type { Request, Response, NextFunction } from "express";
import ejs from "ejs";
import { t } from "i18next";
import Orders from "../../models/orders";
import { createPDF } from "../../utils/pdf-helpers";
import {databaseErrorConverter, ExtendedError} from "../../utils/error-helpers";
import { getDirname } from "../../utils/get-file-url";
import type {DatabaseError, ValidationError} from "sequelize";


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
    // get target order (must be owner or admin)
    Orders.getAll(
        req.session.user?.admin ? "*" : req.session.user?.id,
        req.params.orderId
    )
        .then((orders) => {
            if(orders.length  === 0){
                next(new ExtendedError("404", 404, true, [t("ecommerce.order-not-found")]));
                return;
            }
            return orders[0];
        })
        .then((order) => {
            // Should be impossible
            if(!order)
                return next(new ExtendedError("404", 404, true, [t("ecommerce.order-not-found")]));
            /**
             * Create PDF file
             * Create PDF using get-target-order template OR pure HTML content
             * WARNING: Images and other link-related info will NOT work. Need to convert the images in base64 to embed them correctly in a PDF
             */
            // filename
            const invoiceName = order.dataValues.id + '.pdf';
            // save path
            const invoicePath = path.join('src', 'data', 'invoices', invoiceName);
            // // Direct HTML content (alternative)
            // const htmlContent = `
            //   <html>
            //   <head><title>${order.dataValues.id}</title></head>
            //   <body>
            //     <ul>
            //         <li><b>Email</b>: ${order.dataValues.email}</li>
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
                        return next(new ExtendedError(error.message, 500));
                    return createPDF(htmlContent, order.dataValues.id + '.pdf', 'src/data/invoices')
                        .then(() => {
                            /**
                             * Download file
                             */
                            // PRELOADING data
                            fs.readFile(invoicePath, (err, data) => {
                                if(err)
                                    throw err;
                                // return next(new ExtendedError(err.message, 500))
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
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))
};