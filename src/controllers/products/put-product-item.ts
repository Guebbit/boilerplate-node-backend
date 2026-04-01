import type { Request, Response } from 'express';
import { t } from 'i18next';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { deleteFile } from '@utils/helpers-filesystem';
import type { UpdateProductByIdRequest, UpdateProductByIdRequestMultipart } from '@types';

/**
 * PUT /products/:id
 * Update a product by path id (admin).
 */
export const putProductItem = (
    request: Request<
        { id?: string },
        unknown,
        UpdateProductByIdRequest | UpdateProductByIdRequestMultipart
    >,
    response: Response
) => {
    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    return productService
        .update(String(request.params.id), { ...request.body, imageUrl })
        .then((product) => {
            successResponse(response, product.toObject());
        })
        .catch((error: Error) =>
            (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve()).then(() => {
                if (error.message === '404')
                    rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
                else rejectResponse(response, 500, 'Internal Server Error', [error.message]);
            })
        );
};
