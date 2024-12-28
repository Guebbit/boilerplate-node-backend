import type { CastError } from "mongoose";
import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import {databaseErrorConverter, ExtendedError} from "../../utils/error-helpers";

/**
 * Page POST data
 */
export interface IPostDeleteProductPostData {
    _id: string,
    hardDelete?: string,
}

/**
 * Delete a product
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request<unknown, unknown, IPostDeleteProductPostData>, res: Response, next: NextFunction) =>
    Products.productRemoveById(req.body._id, !!req.body.hardDelete)
        .then(({ success, message }) => {
            if(success)
                req.flash('success', [message]);
            res.redirect('/products/')
        })
        .catch((error: CastError) => {
            if(error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError("404", 404, false, [t("ecommerce.product-not-found")]));
            return next(databaseErrorConverter(error));
        })
