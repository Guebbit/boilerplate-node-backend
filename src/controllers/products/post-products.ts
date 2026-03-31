import type { Request, Response } from 'express';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { CreateProductRequest, CreateProductRequestMultipart } from '@types';

/**
 * POST /products
 * Create a new product (admin).
 */
const postProducts = (request: Request<unknown, unknown, CreateProductRequest | CreateProductRequestMultipart>, response: Response): Promise<void> => {
    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    const errors = ProductService.validateData({
        ...request.body,
        imageUrl: imageUrl ?? request.body.imageUrl
    });
    if (errors.length > 0) {
        const deleteP = imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve();
        return deleteP.then(() => rejectResponse(response, 422, 'createProduct - validation failed', errors));
    }

    return ProductService.create({
        ...request.body,
        imageUrl: imageUrl ?? request.body.imageUrl
    })
        .then((product) => successResponse(response, product.toObject(), 201))
        .catch((error) => {
            const deleteP = imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve();
            return deleteP.then(() =>
                rejectResponse(response, 500, 'Internal Server Error', [(error as Error).message])
            );
        });
};

export default postProducts;
