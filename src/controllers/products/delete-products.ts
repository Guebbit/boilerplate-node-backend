import type { Request, Response } from 'express';
import { t } from 'i18next';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import { DeleteProductRequest } from '@api/model/deleteProductRequest';

export const deleteProducts = (
    request: Request<{ id?: string }, unknown, DeleteProductRequest>,
    response: Response
) => {
    if (!request.params.id && !request.body.id) {
        rejectResponse(response, 422, 'deleteProduct - missing id', [
            t('generic.error-missing-data')
        ]);
        return Promise.resolve();
    }

    return productService
        .remove(String(request.params.id ?? request.body.id), !!request.query.hardDelete)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            successResponse(response, undefined, 200, result.message);
        })
        .catch((error: Error) => {
            if (error.message == '404')
                rejectResponse(response, 404, 'deleteProduct - not found', [
                    t('ecommerce.product-not-found')
                ]);
            rejectResponse(response, 500, 'Unknown Error', [error.message]);
        });
};
