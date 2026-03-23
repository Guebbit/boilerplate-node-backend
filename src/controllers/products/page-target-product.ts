import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import { databaseErrorConverter, ExtendedError } from "@utils/error-helpers";
import ProductService from "@services/products";
import UserService from "@services/users";
import type { ICartItem } from "@models/users";

/**
 * Url parameters
 */
export interface IGetTargetProductParameters {
    productId: string,
}

/**
 * Get (single) product page
 * Only admin can see non-active products
 *
 * @param request
 * @param response
 * @param next
 */
export const pageTargetProduct = (request: Request & {
    params: IGetTargetProductParameters
}, response: Response, next: NextFunction) =>
    ProductService.getById(request.params.productId, request.session.user?.admin)
        .then(async (product) => {
            if (!product)
                return next(new ExtendedError("404", 404, false, [ t("ecommerce.product-not-found") ]));
            // add quantity of product in cart to product details page
            const productsInCart = request.user ? await UserService.cartGet(request.user) : [];
            const { quantity = 0 } = productsInCart.find((cartProduct: ICartItem) => cartProduct.productId === product.id) ?? {};
            response.render('products/details', {
                pageMetaTitle: product.title,
                pageMetaLinks: [
                    "/css/product.css"
                ],
                product: {
                    ...product,
                    quantity
                },
            });
        })
        .catch((error: Error) => {
            if (error.message == "404")
                return next(new ExtendedError("404", 404, false, [ t("ecommerce.product-not-found") ]));
            return next(databaseErrorConverter(error));
        })