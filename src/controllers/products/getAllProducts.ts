import type { Request, Response } from "express";
import Products from "../../models/products";

/**
 * Get all products page
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request, res: Response) =>
    Promise.all([
        (req.session.user?.admin ? Products.scope("admin") : Products )
            .findAll(),
        Products.scope("lowCost")
            .findAll()
    ])
        .then(([productList, productListLC]) =>
            res.render('products/list', {
                pageMetaTitle: 'All Products',
                pageMetaLinks: [
                    "/css/product.css"
                ],
                productList,
                productListLC,
            })
        )