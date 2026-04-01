import type { Request, Response } from 'express';
import { productService as ProductService } from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { deleteFile } from '@utils/helpers-filesystem';
import type { CreateProductRequest, CreateProductRequestMultipart } from '@types';

/**
 * POST /products
 * Create a new product (admin).
 */
export const postProducts = (
    request: Request<unknown, unknown, CreateProductRequest | CreateProductRequestMultipart>,
    response: Response
) => {
    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    const errors = ProductService.validateData({
        ...request.body,
        imageUrl: imageUrl ?? request.body.imageUrl
    });
    if (errors.length > 0)
        return (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve()).then(() => {
            rejectResponse(response, 422, 'createProduct - validation failed', errors);
        });

    return ProductService.create({
        ...request.body,
        imageUrl: imageUrl ?? request.body.imageUrl
    })
        .then((product) => {
            successResponse(response, product.toObject(), 201);
        })
        .catch((error: Error) =>
            (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve()).then(() => {
                rejectResponse(response, 500, 'Internal Server Error', [error.message]);
            })
        );
};

