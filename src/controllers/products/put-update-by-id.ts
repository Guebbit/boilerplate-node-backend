import type { Request, Response } from 'express';
import { t } from 'i18next';
import ProductService from '@services/products';
import { rejectResponse, successResponse } from '@utils/response';
import type { UpdateProductByIdRequest } from '@api/api';

/**
 * PUT /products/:id
 * Update a product by path id (admin).
 */
const updateProductById = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateProductByIdRequest;
    try {
        const product = await ProductService.update(String(request.params.id), body as never);
        successResponse(response, product.toObject());
    } catch (error) {
        const message = (error as Error).message;
        if (message === '404')
            rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        else
            rejectResponse(response, 500, 'Internal Server Error', [message]);
    }
};

export default updateProductById;
