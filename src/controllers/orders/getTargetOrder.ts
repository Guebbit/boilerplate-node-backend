import type { Request, Response } from "express";
import Orders from "../../models/orders";
import {
    Types,
    type CastError,
    type PipelineStage
} from "mongoose";

/**
 * Url parameters
 */
export interface IGetTargetOrderParameters {
    orderId: string,
}

/**
 * Get target order info
 *
 * @param req
 * @param res
 */
export default (req: Request & { params: IGetTargetOrderParameters }, res: Response) => {
    // if it's not valid it could throw an error
    if(!Types.ObjectId.isValid(req.params.orderId))
        return res.redirect('/error/page-not-found');

    // empty match
    const match: PipelineStage.Match = {
        $match: {}
    };
    // If user is NOT admin, it's limited to his own orders
    if(!req.session.user?.admin)
        match.$match.userId = req.session.user?._id;
    // single out the order
    match.$match._id = new Types.ObjectId(req.params.orderId);

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
        // TODO global error catches
        .catch((error: CastError) => {
            console.log("getTargetProduct ERROR", error)
            if(error.message == "404" || error.kind === "ObjectId")
                return res.redirect('/error/product-not-found');
            return res.redirect('/error/unknown');
        });
};