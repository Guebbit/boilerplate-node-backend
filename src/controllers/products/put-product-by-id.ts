import type { Request, Response } from 'express';
import { t } from 'i18next';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { UpdateProductByIdRequest } from '@types';

/**
 * PUT /products/:id
 * Update a product by path id (admin).
 */
const putProductById = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateProductByIdRequest;

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request, body.imageUrl);

    try {
        /**
         * Update the product with the new data
         */
        const product = await ProductService.update(
            String(request.params.id),
            body as never,
            imageUrl
        );
        successResponse(response, product.toObject());
    } catch (error) {
        if (imageUrlRaw) await deleteFile(imageUrlRaw);
        const message = (error as Error).message;
        if (message === '404')
            rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        else rejectResponse(response, 500, 'Internal Server Error', [message]);
    }
};

export default putProductById;
