import type { Request, Response } from "express";
import Products from "../../models/products";

/**
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) => {
    Products.findByPk(req.body.id)
        .then((product) => {
            if (!product)
                throw 404;
            return product.destroy();
        })
        .then(() => res.redirect('/products/'))
        .catch((err) => {
            console.log("postDeleteProduct ERROR", err);
            return res.redirect('/error/unknown');
        });
};
