import type { NextFunction, Request, Response } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import {databaseErrorConverter, ExtendedError} from "../../utils/error-helpers";
import type {DatabaseError, ValidationError} from "sequelize";

/**
 * Url parameters
 */
export interface IGetTargetProductParameters {
    productId: string,
}

/**
 * Get single product details
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request & { params: IGetTargetProductParameters }, res: Response, next: NextFunction) =>
    (req.session.user?.admin ? Products.scope("admin") : Products)
        .findByPk(req.params.productId)
        .then(async (product) => {
            if (!product)
                return next(new ExtendedError("404", 404, true, [t("ecommerce.product-not-found")]));
            // find the quantity of the product in the current user's cart
            const cart = await req.user!.cartGet();
            // @ts-expect-error difficulties with sequelize inferred types
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            const cartItem = cart.CartItems?.find(item => item.ProductId === product.id);
            // alternative
            // const cartItem = await req.user!.cartGet()
            //     .then((cart) =>
            //         CartItems.findOne({
            //             where: {
            //                 CartId: cart.id,
            //                 productId: product.id,
            //             },
            //         })
            //     )
            res.render("products/details", {
                pageMetaTitle: product.dataValues.title,
                pageMetaLinks: [
                    "/css/product.css"
                ],
                product: {
                    ...product.dataValues,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                    quantity: cartItem?.quantity ?? 0,
                },
            });
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))