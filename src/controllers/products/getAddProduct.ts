import type { Request, Response } from "express";
import Products from "../../models/products";

/**
 *
 */
export interface IGetAddProductParameters {
    productId: string,
}

/**
 *
 * @param req
 * @param res
 */
export default (req: Request & { params: IGetAddProductParameters }, res: Response) => {
    Products.findByPk(req.params.productId)
        .then(product => {
            res.render('products/edit', {
                pageMetaTitle: product ? "Edit product" : "Add product",
                pageMetaLinks: [
                    "/css/forms.css"
                ],
                product: {...product?.dataValues || {}},
            });
        })
        .catch((error) => {
            console.log("getTargetProduct ERROR", error)
            if (error == 404)
                return res.redirect('/error/product-not-found');
            return res.redirect('/error/unknown');
        });
};