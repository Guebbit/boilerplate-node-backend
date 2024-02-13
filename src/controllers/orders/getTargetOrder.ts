import type { Request, Response } from "express";
import Products from "../../models/products";

/**
 * 
 */
export interface getTargetOrderParameters {
    orderId: string,
}

/**
 * Get target order info
 * TODO quantity on products
 *
 * @param req
 * @param res
 */
export default (req: Request & { params: getTargetOrderParameters }, res: Response) => {
    if(!req.user)
        return res.redirect('/account/login');
    const { orderId } = req.params;
    req.user
        .getOrders({
            where: {
                id: orderId
            },
        })
        .then(([order]) =>
            order.getOrderItems({
                raw: true,
                include: [{
                    model: Products
                }]
            })
                .then((products) =>
                    res.render('orders/details', {
                        pageMetaTitle: 'Order',
                        pageMetaLinks: [
                            "/css/order-details.css",
                        ],
                        order: order.dataValues,
                        products,
                    })
                )
        )

};