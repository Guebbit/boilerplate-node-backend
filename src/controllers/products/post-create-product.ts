import type { NextFunction, Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { deleteFile } from '@utils/helpers-filesystem';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { ExtendedError } from '@utils/helpers-errors';
import type { CreateProductRequestMultipart, UpdateProductRequestMultipart } from '@types';
import ProductService from '@services/products';

/**
 * Create or update a product.
 * Handles image upload, data validation, and redirects.
 *
 * @param request
 * @param response
 * @param next
 */
export const postCreateProduct = (
    request: Request<
        unknown,
        unknown,
        CreateProductRequestMultipart | UpdateProductRequestMultipart
    >,
    response: Response,
    next: NextFunction
) => {
    const id = (request.body as { id?: string }).id;

    /**
     * Get URL of updated image: uploaded file takes priority over body imageUrl.
     * If no image was provided at all, fall back to an empty string.
     */
    const { imageUrlRaw, imageUrl: imageUrlFile } = resolveImageUrl(request as Request);
    const imageUrl = imageUrlFile ?? request.body.imageUrl ?? '';
    // If problem arises: remove the uploaded file (that can be missing so nothing happen)
    const deleteUpload = () => (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve(true));

    /**
     * Data validation
     */
    const issues = ProductService.validateData({
        ...request.body,
        imageUrl,
        active: !!request.body.active
    });

    /**
     * Validation error
     */
    if (issues.length > 0) {
        // Record was not created, so revert server changes by removing the uploaded file
        return deleteUpload().then(() => {
            request.flash('error', issues);
            request.flash('filled', Object.values(request.body));
            if (!id || id === '') return response.redirect('/products/add');
            return response.redirect('/products/edit/' + id);
        });
    }

    /**
     * NO ID = new product
     */
    if (!id || id === '')
        return ProductService.create({
            ...request.body,
            imageUrl,
            active: !!request.body.active
        })
            .then(() => response.redirect('/products/'))
            .catch((error: CastError) => {
                return deleteUpload().then(() =>
                    next(new ExtendedError(error.kind, 500, false, [error.message]))
                );
            });

    /**
     * ID = edit product
     */
    return ProductService.update(id, {
        ...request.body,
        imageUrl,
        active: !!request.body.active
    })
        .then((updatedProduct) =>
            response.redirect('/products/details/' + updatedProduct._id.toString())
        )
        .catch((error: CastError) => {
            return deleteUpload().then(() =>
                next(new ExtendedError(error.kind, 500, false, [error.message]))
            );
        });
};
