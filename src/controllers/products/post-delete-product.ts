import type { CastError } from "mongoose";
import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import { ExtendedError } from "../../utils/error-helpers";

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
    Products.findById(req.body._id)
        .then(product => {
            if (!product){
                next(new ExtendedError("404", 404, false, [t("ecommerce.product-not-found")]));
                return;
            }
            // HARD delete
            if(req.body.hardDelete)
                return product.deleteOne()
                    // eslint-disable-next-line unicorn/no-useless-undefined
                    .then(() => undefined)
            // SOFT delete. If deletedAt already present: UNDELETE
            product.deletedAt = product.deletedAt ? undefined : new Date();
            return product.save();
        })
        .then(() => res.redirect('/products/'))
        .catch((error: CastError) => {
            if(error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError(t("ecommerce.product-not-found"), 404, false));
            return next(new ExtendedError(error.kind, Number.parseInt(error.message), false));
        })
