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
 * @param request
 * @param response
 * @param next
 */
export const postEditProduct = async (request: Request<unknown, unknown, IPostEditProductsPostData>, response: Response, next: NextFunction) => {
    /**
     * get POST data
     */
    const {
        id,
        title = "",
        price = "0",
        description = "",
        active
    } = request.body;

    /**
     * Get URL of updated image it's on req.file,
     * but it's good to know that it could be within an array
     * If no image was uploaded: it's empty
     * If image was uploaded: delete the old one (if any) on save
     */
    const imageUrlRaw = (request.file ? request.file.path : (request.files ? (request.files as Express.Multer.File[])[0].path : ""));
    // remove "public" at root ("/" remain as root)
    const imageUrl = imageUrlRaw.replace((process.env.NODE_PUBLIC_PATH ?? "public"), "");

    /**
     * Data validation
     */
    const issues = Products.validateData({
        title,
        imageUrl,
        price: Number.parseInt(price),
        description,
        active: !!active
    });

    /**
     * Validation error
     */
    if (issues.length > 0) {
        // Record was not created, so revert server changes by removing the uploaded file
        if (imageUrlRaw.length > 0)
            await deleteFile(imageUrlRaw);
        request.flash('error', issues);
        request.flash('filled', [
            title,
            price,
            description,
            active,
        ]);
        if (!id || id === '')
            return response.redirect('/products/add');
        return response.redirect('/products/edit/' + id);
    }

    /**
     * NO ID = new product
     */
    if (!id || id === '')
        Products.create({
            title,
            imageUrl,
            price: Number.parseInt(price),
            description,
            active: !!active,
        })
            .then(() => response.redirect('/products/'))
            .catch(async (error: CastError) => {
                if (imageUrlRaw.length > 0)
                    await deleteFile(imageUrlRaw);
                return next(new ExtendedError(error.kind, 500, false, [ error.message ]));
            });
    /**
     * ID = edit product
     */
    else
        Products.findById(id)
            .then(async (product) => {
                if (!product)
                    throw new Error("404");
                product.title = title;
                // if empty: no image was uploaded
                const oldImageUrl = product.imageUrl;
                if (oldImageUrl !== imageUrl)
                    product.imageUrl = imageUrl;
                product.price = Number.parseInt(price);
                product.description = description;
                product.active = !!active;
                // save the updated product (not necessary to use newProduct variable since the ID doesn't change, but normally it would be necessary)
                const newProduct = await product.save();
                // after saving the new product image, delete the old one
                if (oldImageUrl !== imageUrl)
                    await deleteFile((process.env.NODE_PUBLIC_PATH ?? "public") + oldImageUrl);
                response.redirect('/products/details/' + (newProduct.id as string))
            })
            .catch(async (error: CastError) => {
                if (imageUrlRaw.length > 0)
                    await deleteFile(imageUrlRaw);
                return next(new ExtendedError(error.kind, 500, false, [ error.message ]));
            });
};