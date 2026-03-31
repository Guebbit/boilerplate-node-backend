import type { Request, Response } from 'express';
import { t } from 'i18next';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import type { DeleteProductRequest } from '@types';

/**
 * DELETE /products
 * Delete a product by id in the request body (admin).
 */
const deleteProducts = (request: Request, response: Response): Promise<void> => {
    const body = request.body as DeleteProductRequest;
    if (!body.id) {
        rejectResponse(response, 422, 'deleteProduct - missing id', [
            t('generic.error-missing-data')
        ]);
        return Promise.resolve();
    }
    return ProductService.remove(body.id, body.hardDelete ?? false).then((result) => {
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, undefined, 200, result.message);
    });
};

export default deleteProducts;
