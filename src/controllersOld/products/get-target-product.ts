import type {Request, Response} from "express";
import type {CastError} from "mongoose";
import {t} from "i18next";
import Products, {type IProductDocument} from "../../models/products";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import type {ObjectId} from "mongodb";
import {rejectResponse, successResponse} from "../../utils/response";
import {EUserRoles} from "../../models/users";

/**
 * Url parameters
 */
export interface IGetTargetProductParameters {
    id: string,
}

/**
 * Get (single) product page
 * Only admin can see non-active products
 *
 * @param req
 * @param res
 */
export default async (req: Request<IGetTargetProductParameters>, res: Response) => {
    await (
        req.user?.roles.includes(EUserRoles.ADMIN) ?
            // admin can search inactive or deleted products
            Products.findById(req.params.id) :
            // NON admin can only search active and NOT (soft) deleted products
            Products.findOne({
                _id: req.params.id,
                active: true,
                deletedAt: undefined
            })
    )
        .lean({ virtuals: true })
        .then(async (product) => {
            if (!product) {
                rejectResponse(res, 404, t("ecommerce.product-not-found"))
                return
            }
            // add quantity of product in cart to product details page
            const productsInCart = req.user ? await req.user.cartGet() : [];
            const {quantity = 0} = productsInCart.find(({product}) => ((product as IProductDocument)._id as ObjectId).equals(product._id as ObjectId)) ?? {};
            return successResponse(res, {
                ...product,
                quantity
            })
        })
        .catch((error: CastError) => {
            if (error.message == "404" || error.kind === "ObjectId")
                return rejectResponse(res, 404, t("ecommerce.product-not-found"))
            return rejectResponse(res, ...databaseErrorInterpreter(error))
        })
}