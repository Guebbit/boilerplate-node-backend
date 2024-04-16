import { Request, Response } from "express";
import Products from "../../models/products";

/**
 * Get all products
 * Only admin can see non-active products
 *
 * @param req
 * @param res
 */
export default async (req: Request, res: Response) =>
    Promise.all([
        req.session.user?.admin ?
            Products.find() :
            Products.find({ active: true, deletedAt: null }),
        Products.find({ price: { $lt: 30 }, active: true, deletedAt: null })
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
        );