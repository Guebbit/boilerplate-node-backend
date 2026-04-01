import type { Request, Response } from 'express';
import { t } from 'i18next';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import type { CastError } from 'mongoose';
import { DeleteProductRequest } from '@api/model/deleteProductRequest';

/**
 * DELETE /products/:id
 * Delete a product by path id (admin).
 * Pass ?hardDelete=true to permanently delete; otherwise soft-deletes.
 */
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

    // true = hard-delete; false (default) = soft-delete (sets deletedAt)
    return productService
        .remove(String(request.params.id ?? request.body.id), !!request.query.hardDelete)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            successResponse(response, undefined, 200, result.message);
        })
        .catch((error: CastError) => {
            if (error.message == '404' || error.kind === 'ObjectId')
                rejectResponse(response, 404, 'deleteProduct - not found', [
                    t('ecommerce.product-not-found')
                ]);
            rejectResponse(response, 500, 'Unknown Error', [error.message]);
        });
};
