import type { Request, Response } from "express";
import Products from "../../models/products";

/**
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
    Promise.all([
        // [admin scope] rule
        (req.session.user?.admin ? Products.unscoped() : Products )
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
        .catch((error) => {
            console.log("getAllProducts ERROR", error)
            return res.redirect('/error/unknown');
        });