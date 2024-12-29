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
 * @param req
 * @param res
 * @param next
 */
export default (req: Request & { params: IGetEditProductParameters }, res: Response, next: NextFunction) => {
    Products.findByPk(req.params.productId)
        .then(product => {
            res.render('products/edit', {
                pageMetaTitle: product ? "Edit product" : "Add product",
                pageMetaLinks: [
                    "/css/forms.css"
                ],
                product: {...product?.dataValues },
            });
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))
};