import type { Request, Response } from "express";
import Products from "../../models/products";

/**
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
    // [admin scope] rule
    (req.session.user?.admin ? Products.unscoped() : Products)
        .findByPk(req.params.productId)
        .then(product => {
            if (!product)
                throw 404
            res.render('products/details', {
                product: product.dataValues,
                pageMetaTitle: product.dataValues.title,
                pageMetaLinks: [
                    "/css/product.css"
                ],
            });
        })
        .catch((error) => {
            console.log("getTargetProduct ERROR", error)
            if (error == 404)
                return res.redirect('/error/product-not-found');
            return res.redirect('/error/unknown');
        });