import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from 'i18next';
import type { CastError } from 'mongoose';
import { productService } from '@services/products';
import { rejectResponse, successResponse } from '@utils/response';
import { extractAndValidateId, extractHardDelete } from '@utils/helpers-request';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';

/**
 * DELETE /products/:id
 * Delete a product by path id (admin).
 * Pass ?hardDelete=true to permanently delete; otherwise soft-deletes.
 */
export const deleteProducts = (request: Request<ParamsDictionary>, response: Response) => {
    const id = extractAndValidateId(request, response, 'deleteProduct');
    if (!id) return Promise.resolve();

    const hardDelete = extractHardDelete(request);

    return productService
        // true = hard-delete; false (default) = soft-delete (sets deletedAt)
        .removeById(id, hardDelete)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            emitAuditEvent(buildAuditEvent(request, {
                action: AuditAction.ADMIN_PRODUCT_DELETED,
                outcome: 'success',
                target_type: 'product',
                target_id: id,
                metadata: { hardDelete }
            }));
            successResponse(response, undefined, 200, result.message);
        })
        .catch((error: CastError) => {
            if (error.message === '404' || error.kind === 'ObjectId')
                return rejectResponse(response, 404, 'deleteProduct - not found', [
                    t('ecommerce.product-not-found')
                ]);
            rejectResponse(response, 500, 'deleteProduct', [error.message]);
        });
};
