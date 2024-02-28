import type { Request, Response } from "express";
import type { CastError } from "mongoose";
import Products from "../../models/products";

/**
 * Get (single) product page
 * Only admin can see non-active products
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
    (
        req.session.user?.admin ?
        Products.findById(req.params.productId) :
        Products.findOne({ _id: req.params.productId, active: true, deletedAt: undefined })
    )
            .then(product => {
                console.log("WHATHEFUCK", product)
                if (!product)
                    throw new Error("404");
                res.render('products/details', {
                    pageMetaTitle: product.title,
                    pageMetaLinks: [
                        "/css/product.css"
                    ],
                    product,
                });
            })
            .catch((error: CastError) => {
                console.log("getTargetProduct ERROR", error)
                if(error.message == "404" || error.kind === "ObjectId")
                    return res.redirect('/error/product-not-found');
                return res.redirect('/error/unknown');
            });