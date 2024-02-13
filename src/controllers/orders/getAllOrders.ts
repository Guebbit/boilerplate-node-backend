import type { Request, Response } from "express";
import OrderItems from "../../models/order-items";
import { fn, col } from "sequelize";

export default (req: Request, res: Response) => {
    if(!req.user)
        return res.redirect('/account/login');

    /**
     *
     * Get sum of quantities and prices
     * TODO price
     */
    req.user.getOrders({
        attributes: [
            'id',
            [fn('SUM', col('quantity')), 'totalQuantity'],
            [fn('COUNT', col('OrderItems.id')), 'totalItems']
        ],
        include: [{
            model: OrderItems,
            attributes: [],     // no need of fields from OrderItems
            required: false,    // perform a LEFT JOIN
            duplicating: false  // avoid duplicate rows
        }],
        group: ['UserId', 'Orders.id'], // GROUP BY
    })
        .then((orderList) =>
            res.render('orders/list', {
                pageMetaTitle: 'Your Orders',
                pageMetaLinks: [
                    "/css/order-list.css",
                ],
                orderList
            })
        )
};