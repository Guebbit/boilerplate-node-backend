import type { Request, Response } from 'express';
import { t } from 'i18next';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateProductRequest } from '../../../api/api';

/**
 * PUT /products
 * Update a product by id in the request body (admin).
 */
const putProducts = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateProductRequest;
    if (!body.id) {
        rejectResponse(response, 422, 'updateProduct - missing id', [t('generic.error-missing-data')]);
        return;
    }
    try {
        const product = await ProductService.update(body.id, body as never);
        successResponse(response, product.toObject());
    } catch (error) {
        const message = (error as Error).message;
        if (message === '404')
            rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        else
            rejectResponse(response, 500, 'Internal Server Error', [message]);
    }
};

export default putProducts;
