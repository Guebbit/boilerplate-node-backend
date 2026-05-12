import type { Request, Response } from 'express';
import { t } from 'i18next';
import { Types } from 'mongoose';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import type { CastError } from 'mongoose';
import type { DeleteProductRequest } from '@types';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';

/**
 * DELETE /products/:id
 * Delete a product by path id (admin).
 * Pass ?hardDelete=true to permanently delete; otherwise soft-deletes.
 */
export const deleteProducts = (
    request: Request<{ id?: string }, unknown, DeleteProductRequest>,
    response: Response
) => {
    const id = request.params.id ?? request.body.id;

    if (!id || !Types.ObjectId.isValid(id)) {
        rejectResponse(response, 422, 'deleteProduct - missing id', [
            t('generic.error-missing-data')
        ]);
        return Promise.resolve();
    }

    // true = hard-delete; false (default) = soft-delete (sets deletedAt)
    return productService
        .remove(id, !!request.query.hardDelete)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            emitAuditEvent({
                action: AuditAction.ADMIN_PRODUCT_DELETED,
                actor_user_id: request.user?.id ?? 'unknown',
                actor_role: 'admin',
                outcome: 'success',
                target_type: 'product',
                target_id: id,
                ...extractRequestContext(request),
                metadata: { hardDelete: !!request.query.hardDelete }
            });
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
