import type { Request, Response, NextFunction } from "express";
import Products from "../../models/products";
import {databaseErrorConverter} from "../../utils/error-helpers";
import type {DatabaseError, ValidationError} from "sequelize";

/**
 *
 */
export interface IGetEditProductParameters {
    productId: string,
}

/**
 * Get product insertion page
 * If productId is provided: it's an editing page
 *
 * @param request
 * @param response
 * @param next
 */
export const getEditProduct = (request: Request & { params: IGetEditProductParameters }, response: Response, next: NextFunction) => {
    Products.findByPk(request.params.productId)
        .then(product => {
            response.render('products/edit', {
                pageMetaTitle: product ? "Edit product" : "Add product",
                pageMetaLinks: [
                    "/css/forms.css"
                ],
                product: {...product?.dataValues },
            });
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))
};