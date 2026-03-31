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
export const postEditProduct = (
    request: Request<unknown, unknown, CreateProductRequestMultipart | UpdateProductRequestMultipart>,
    response: Response,
    next: NextFunction
) => {
    const id = ('id' in request.body ? (request.body as UpdateProductRequestMultipart).id : undefined) as
        | string
        | undefined;
    const { title, description = '', active } = request.body;
    const price = Number.parseInt(String(request.body.price));

    /**
     * Get URL of updated image: uploaded file takes priority over body imageUrl.
     * If no image was provided at all, fall back to an empty string.
     */
    const { imageUrlRaw, imageUrl: imageUrlFile } = resolveImageUrl(request as Request);
    const imageUrl = imageUrlFile ?? request.body.imageUrl ?? '';

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
        const cleanup = imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve();
        return cleanup.then(() => {
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
            title,
            imageUrl,
            price,
            description,
            active: !!active
        })
            .then(() => response.redirect('/products/'))
            .catch((error: CastError) => {
                const cleanup = imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve();
                return cleanup.then(() =>
                    next(new ExtendedError(error.kind, 500, false, [error.message]))
                );
            });

    /**
     * ID = edit product
     */
    return ProductService.update(
        id,
        {
            title,
            price,
            description,
            active: !!active
        },
        imageUrl
    )
        .then((updatedProduct) =>
            response.redirect('/products/details/' + updatedProduct._id.toString())
        )
        .catch((error: CastError) => {
            const cleanup = imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve();
            return cleanup.then(() =>
                next(new ExtendedError(error.kind, 500, false, [error.message]))
            );
        });
};
