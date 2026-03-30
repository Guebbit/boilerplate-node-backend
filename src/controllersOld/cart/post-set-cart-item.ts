import type {Request, Response} from "express";
import {t} from "i18next";
import Products from "../../models/products";
import type {CastError} from "mongoose";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";

/**
 * Page POST data
 */
export interface IPostSetCartItemPostData {
    id: string,
    quantity: string,
    add?: "0" | "1"
}

/**
 * Add a product (with its quantity) to cart, check availability, etc
 * Create a CartItem row.
 *
 * @param req
 * @param res
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export default (req: Request<IPostSetCartItemPostData | {}, unknown, IPostSetCartItemPostData | {}>, res: Response) => {
    const {
        id,
        quantity,
        add: addRaw
    } = req.method === "POST" ? req.body as IPostSetCartItemPostData : req.params as IPostSetCartItemPostData;
    const add = addRaw ? addRaw === "1" : undefined;
    Products.findOne({
        _id: id,
        active: true,
        deletedAt: undefined
    })
        .then((product) => {
            // not found, something happened
            if (!product) {
                rejectResponse(res, 404, t("ecommerce.product-not-found"));
                return
            }
            // check done before entering the route
            return req.user!.cartItemSet(product, Number.parseInt(quantity), Boolean(add))
                .then(({data}) => successResponse(res, data, 200, t("ecommerce.product-added-to-cart")));
        })
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}
