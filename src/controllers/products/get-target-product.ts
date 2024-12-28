import type {Request, Response, NextFunction} from "express";
import type {CastError} from "mongoose";
import {t} from "i18next";
import Products from "../../models/products";
import {databaseErrorConverter, ExtendedError} from "../../utils/error-helpers";
import type {ObjectId} from "mongodb";

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
 * @param req
 * @param res
 * @param next
 */
export default (req: Request & { params: IGetTargetProductParameters }, res: Response, next: NextFunction) =>
    (
        req.session.user?.admin ?
            // admin can search inactive or deleted products
            Products.findById(req.params.productId) :
            // NON admin can only search active and NOT (soft) deleted products
            Products.findOne({
                _id: req.params.productId,
                active: true,
                deletedAt: undefined
            })
    )
        .lean()
        .then(async (product) => {
            if (!product)
                return next(new ExtendedError("404", 404, false, [t("ecommerce.product-not-found")]));
            // add quantity of product in cart to product details page
            const productsInCart = req.user ? await req.user.cartGet() : [];
            const { quantity = 0 } = productsInCart.find(cartProduct => cartProduct.product._id.equals(product._id as ObjectId)) ?? {};
            res.render('products/details', {
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
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return next(new ExtendedError("404", 404, false, [t("ecommerce.product-not-found")]));
            return next(databaseErrorConverter(error));
        })