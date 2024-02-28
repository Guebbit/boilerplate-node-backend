import type { Request, Response } from "express";
import type { CastError } from "mongoose";
import Products from "../../models/products";

/**
 * Url parameters
 */
export interface getEditProductParameters {
    productId: string,
}

/**
 *
 * @param req
 * @param res
 */
export default (req: Request & { params: getEditProductParameters }, res: Response) => {
    Products.findById(req.params.productId)
        .then(product => {
            const [
                title,
                imageUrl,
                price,
                description,
                active,
            ] = req.flash('filled');
            res.render('products/edit', {
                pageMetaTitle: product ? "Edit product" : "Add product",
                pageMetaLinks: [
                    "/css/forms.css"
                ],
                // old object (if any)
                product: product || {
                    // filled inputs (if any)
                    title,
                    imageUrl,
                    price,
                    description,
                    active,
                },
            });
        })
        .catch((error: CastError) => {
            console.log("getTargetProduct ERROR", error)
            return res.redirect('/error/unknown');
        });
};