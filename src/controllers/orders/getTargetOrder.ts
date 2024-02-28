import type { Request, Response } from "express";
import Orders from "../../models/orders";
import { Types, type CastError} from "mongoose";

/**
 * Url parameters
 */
export interface getTargetOrderParameters {
    orderId: string,
}

/**
 * Get target order info
 *
 * @param req
 * @param res
 */
export default (req: Request & { params: getTargetOrderParameters }, res: Response) => {
    // if it's not valid it could throw an error
    if(!Types.ObjectId.isValid(req.params.orderId))
        return res.redirect('/error/page-not-found');

    const match = {
        $match: {}
    };
    if(!req.session.user?.admin)
        match.$match = {
            ...match.$match,
            userId: req.session.user?._id
        };
    match.$match = {
        ...match.$match,
       _id: new Types.ObjectId(req.params.orderId)
    };

    Orders.getAll([match])
        .then((orders) => {
            if(orders.length < 1)
                throw new Error("404");
            return res.render('orders/details', {
                pageMetaTitle: 'Order',
                pageMetaLinks: [
                    "/css/order-details.css",
                ],
                order: orders[0]
            })
        })
        .catch((error: CastError) => {
            console.log("getTargetProduct ERROR", error)
            if(error.message == "404" || error.kind === "ObjectId")
                return res.redirect('/error/product-not-found');
            return res.redirect('/error/unknown');
        });
};