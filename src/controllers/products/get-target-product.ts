import type { NextFunction, Request, Response } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import { databaseErrorConverter, ExtendedError } from "../../utils/error-helpers";
import type { DatabaseError, ValidationError } from "sequelize";

/**
 * Url parameters
 */
export interface IGetTargetProductParameters {
    productId: string,
}

/**
 * Get single product details
 *
 * @param request
 * @param response
 * @param next
 */
export const getTargetProduct = (request: Request & {
    params: IGetTargetProductParameters
}, response: Response, next: NextFunction) =>
    (request.session.user?.admin ? Products.scope("admin") : Products)
        .findByPk(request.params.productId)
        .then(async (product) => {
            if (!product)
                return next(new ExtendedError("404", 404, true, [ t("ecommerce.product-not-found") ]));
            // find the quantity of the product in the current user's cart
            const cart = await request.user!.cartGet();
            // @ts-expect-error difficulties with sequelize inferred types

            const cartItem = cart.CartItems?.find(item => item.ProductId === product.id);
            // alternative
            // const cartItem = await request.user!.cartGet()
            //     .then((cart) =>
            //         CartItems.findOne({
            //             where: {
            //                 CartId: cart.id,
            //                 productId: product.id,
            //             },
            //         })
            //     )
            response.render("products/details", {
                pageMetaTitle: product.dataValues.title,
                pageMetaLinks: [
                    "/css/product.css"
                ],
                product: {
                    ...product.dataValues,

                    quantity: cartItem?.quantity ?? 0,
                },
            });
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))