import type { NextFunction, Request, Response } from "express";
import type { CastError } from "mongoose";
import Products from "../../models/products";
import { deleteFile } from "../../utils/filesystem-helpers";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Page POST data
 */
export interface IPostEditProductsPostData {
    id: string,
    title: string,
    price: string,
    description: string,
    active: string,
}

/**
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request<unknown, unknown, IPostEditProductsPostData>, res: Response, next: NextFunction) => {
    /**
     * get POST data
     */
    const {
        id,
        title = "",
        price = "0",
        description = "",
        active
    } = req.body;

    /**
     * Get URL of updated image it's on req.file,
     * but it's good to know that it could be within an array
     */
    const imageUrlRaw = (req.file ? req.file.path : req.files ? (req.files as Express.Multer.File[])[0].path : "");
    // remove "public" at root ("/" remain as root)
    const imageUrl = imageUrlRaw.replace("public", "");

    /**
     * Data validation
     */
    const issues = Products.validateData({
        title,
        imageUrl,
        price: parseInt(price),
        description,
        active: !!active
    });

    /**
     * Validation error
     */
    if(issues.length > 0){
        // Record was not created, so revert server changes by removing the uploaded file
        if(imageUrlRaw.length > 0)
            deleteFile(imageUrlRaw);
        req.flash('error', issues);
        req.flash('filled', [
            title,
            price,
            description,
            active,
        ]);
        if (!id || id === '')
            return res.redirect('/products/add');
        return res.redirect('/products/edit/' + id);
    }

    /**
     * NO ID = new product
     */
    if (!id || id === '')
        Products.create({
            title,
            imageUrl,
            price: parseInt(price),
            description,
            active: !!active,
        })
            .then(() => res.redirect('/products/'))
            .catch((err: CastError) => {
                if(imageUrlRaw.length > 0)
                    deleteFile(imageUrlRaw);
                return next(new ExtendedError(err.kind, 500, err.message));
            });
    /**
     * ID = edit product
     */
    else
        Products.findById(id)
            .then((product) => {
                if (!product)
                    throw new Error("404");
                product.title = title;
                product.imageUrl = imageUrl;
                product.price = parseInt(price);
                product.description = description;
                product.active = !!active;
                return product.save();
            })
            .then((product) => res.redirect('/products/details/' + product.id))
            .catch((error: CastError) => {
                if(imageUrlRaw.length > 0)
                    deleteFile(imageUrlRaw);
                return next(new ExtendedError(error.kind, 500, error.message));
            });
};