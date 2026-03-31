import type { Request, Response } from 'express';
import { t } from 'i18next';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { UpdateProductByIdRequest, UpdateProductByIdRequestMultipart } from '@types';

/**
 * PUT /products/:id
 * Update a product by path id (admin).
 */
const putProductById = (request: Request<{ id?: string }, unknown, UpdateProductByIdRequest | UpdateProductByIdRequestMultipart>, response: Response): Promise<void> => {
    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    return ProductService.update(
        String(request.params.id),
        { ...request.body, ...(imageUrl !== undefined && { imageUrl }) }
    )
        .then((product) => successResponse(response, product.toObject()))
        .catch((error) => {
            const cleanupPromise = imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve();
            return cleanupPromise.then(() => {
                const message = (error as Error).message;
                if (message === '404')
                    rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
                else rejectResponse(response, 500, 'Internal Server Error', [message]);
            });
        });
};

export default putProductById;
