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
 * @param request
 * @param response
 * @param next
 */
export const postDeleteProduct = (request: Request<unknown, unknown, IPostDeleteProductPostData>, response: Response, next: NextFunction) =>
    // isAdmin protected route: user is admin
    Products.productRemoveById(request.body.id, !!request.body.hardDelete)
        .then(({ success, message, errors }) => {
            if(success)
                request.flash('success', [message]);
            else
                request.flash('error', errors);
            response.redirect('/products/')
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))
