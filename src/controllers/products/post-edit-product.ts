import type { NextFunction, Request, Response } from "express";

import { deleteFile } from "@utils/filesystem-helpers";
import { ExtendedError } from "@utils/error-helpers";
import type { UpdateProductRequestBody } from "@api/api";
import ProductService from "@services/products";

/**
 * Create or update a product.
 * Handles image upload, data validation, and redirects.
 *
 * @param request
 * @param response
 * @param next
 */
export const postEditProduct = async (request: Request<unknown, unknown, UpdateProductRequestBody>, response: Response, next: NextFunction) => {
    const {
        id,
        title,
        description = "",
        active
    } = request.body;
    const price = Number.parseInt(request.body.price);

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
    const issues = ProductService.validateData({
        title,
        imageUrl,
        price,
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
        request.flash('filled', Object.values(request.body));
        if (!id || id === '')
            return response.redirect('/products/add');
        return response.redirect('/products/edit/' + id);
    }

    /**
     * NO ID = new product
     */
    if (!id || id === '')
        return ProductService.create({
            title,
            imageUrl,
            price,
            description,
            active: !!active,
        })
            .then(() => response.redirect('/products/'))
            .catch(async (error: Error) => {
                if (imageUrlRaw.length > 0)
                    await deleteFile(imageUrlRaw);
                return next(new ExtendedError(error.message, 500, false));
            });

    /**
     * ID = edit product
     */
    return ProductService.update(id, {
        title,
        price,
        description,
        active: !!active,
    }, imageUrl)
        .then((updatedProduct) => response.redirect('/products/details/' + String(updatedProduct.id)))
        .catch(async (error: Error) => {
            if (imageUrlRaw.length > 0)
                await deleteFile(imageUrlRaw);
            return next(new ExtendedError(error.message, 500, false));
        });
};