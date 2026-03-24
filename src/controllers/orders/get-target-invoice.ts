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
import OrderService from "@services/orders";
import { createPDF } from "@utils/pdf-helpers";
import { databaseErrorConverter, ExtendedError } from "@utils/error-helpers";
import { getDirname } from "@utils/get-file-url";

/**
 * Path parameters for order invoice endpoint
 */
export interface IGetTargetInvoiceParameters {
    orderId: string
}

/**
 * Get target invoice file and download it
 * GET /orders/:orderId/invoice
 *
 * @param request
 * @param response
 * @param next
 */
export const getTargetInvoice = (request: Request & {
    params: IGetTargetInvoiceParameters
}, response: Response, next: NextFunction) => {
    // if it's not valid it could throw an error
    if (!Types.ObjectId.isValid(request.params.orderId))
        return next(new ExtendedError(t("ecommerce.order-not-found"), 404, true));

    /**
     * Where build (same as get-target-order.ts)
     */
    const match: PipelineStage.Match = {
        $match: {}
    };
    if (!request.user?.admin)
        match.$match.userId = request.user?._id;
    match.$match._id = new Types.ObjectId(request.params.orderId);

    OrderService.getAll([ match ])
        .then(async (orders) => {
            if (orders.length === 0)
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));
            const order = orders[0];
            /**
             * Create PDF file
             * Create PDF using the invoice template OR pure HTML content
             * WARNING: Images and other link-related info will NOT work. Need to convert the images in base64 to embed them correctly in a PDF
             */
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            const invoiceName = order._id + '.pdf'; // filename
            // save path
            const invoicePath = path.join('src', 'data', 'invoices', invoiceName);
            // Use an ejs template
            try {
                const htmlContent = await ejs.renderFile(
                    // Retrieve the template
                    path.resolve(getDirname(import.meta.url), '../../../views/templates', 'invoice-order-file.ejs'),
                    // Populate the template
                    {
                        pageMetaTitle: 'Order',
                        pageMetaLinks: [],
                        order,
                    },
                );
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                await createPDF(htmlContent, order._id + '.pdf', 'src/data/invoices');
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
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.order-not-found") ]));
            return next(databaseErrorConverter(error));
        });
};