import type { Request, Response } from 'express';
import { t } from 'i18next';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { UpdateProductRequest, UpdateProductRequestMultipart } from '@types';

/**
 * PUT /products
 * Update a product by id in the request body (admin).
 */
const putProducts = async (request: Request<unknown, unknown, UpdateProductRequest | UpdateProductRequestMultipart>, response: Response): Promise<void> => {
    const body = request.body as UpdateProductRequest;
    if (!body.id) {
        rejectResponse(response, 422, 'updateProduct - missing id', [
            t('generic.error-missing-data')
        ]);
        return;
    }

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    try {
        const product = await ProductService.update(body.id, {
            ...request.body,
            imageUrl: imageUrl ?? request.body.imageUrl
        });
        successResponse(response, product.toObject());
    } catch (error) {
        if (imageUrlRaw) await deleteFile(imageUrlRaw);
        const message = (error as Error).message;
        if (message === '404')
            rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        else rejectResponse(response, 500, 'Internal Server Error', [message]);
    }
};

export default putProducts;
