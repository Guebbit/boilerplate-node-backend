import type { CastError } from "mongoose";
import type { Request, Response } from "express";
import Products from "../../models/products";

/**
 * Page POST data
 */
export interface IPostDeleteProductPostData {
    _id: string,
    hardDelete?: string,
}

/**
 *
 * @param req
 * @param res
 */
export default (req: Request<unknown, unknown, IPostDeleteProductPostData>, res: Response) =>
    Products.findById(req.body._id)
        .then((product) => {
            if (!product)
                throw new Error("404");
            // HARD delete
            if(req.body.hardDelete){
                product.deleteOne();
                return;
            }
            // SOFT delete. If deletedAt already present: UNDELETE
            if(product.deletedAt)
                product.deletedAt = undefined
            else
                product.deletedAt = new Date();
            return product.save();
        })
        .then(() => res.redirect('/products/'))
        .catch((error: CastError) => {
            console.log("postDeleteProduct ERROR", error);
            return res.redirect('/error/unknown');
        });
