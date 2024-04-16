import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Page POST data
 */
export interface IPostDeleteProductPostData {
    id: string,
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
    (req.session.user?.admin ? Products.scope("admin") : Products).findByPk(req.body.id)
        .then((product) => {
            if (!product)
                return next(new ExtendedError("404", 404, t("ecommerce.product-not-found")));
            // HARD delete
            if(req.body.hardDelete)
                product.destroy({ force: true })
                    .then(() => null)
            // SOFT delete. If deletedAt already present: UNDELETE
            if(product.deletedAt)
                return product.restore()
            return product.destroy()
                .then(() => null)
        })
        .then(() => res.redirect('/products/'))
        .catch(err =>
            next(new ExtendedError("500", 500, err, false)));
