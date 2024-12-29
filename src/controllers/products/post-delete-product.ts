import type { Request, Response, NextFunction } from "express";
import Products from "../../models/products";
import {databaseErrorConverter} from "../../utils/error-helpers";
import type {DatabaseError, ValidationError} from "sequelize";

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
    // isAdmin protected route: user is admin
    Products.productRemoveById(req.body.id, !!req.body.hardDelete)
        .then(({ success, message, errors }) => {
            if(success)
                req.flash('success', [message]);
            else
                req.flash('error', errors);
            res.redirect('/products/')
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))
