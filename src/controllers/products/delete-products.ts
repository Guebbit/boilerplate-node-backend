import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from '@core/i18n';
import type { CastError } from 'mongoose';
import { productService } from '@services/products';
import { rejectResponse, successResponse } from '@core/http/response';
import { rejectDatabaseError } from '@core/http/errors';
import { extractAndValidateId, readInput } from '@core/http/request';
import { hardDeleteSchema } from '@core/http/schemas';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@core/observability/audit';

/**
 * DELETE /products/:id
 * Delete a product by path id (admin).
 * Pass ?hardDelete=true to permanently delete; otherwise soft-deletes.
 */
export const deleteProducts = (request: Request<ParamsDictionary>, response: Response) => {
    const id = extractAndValidateId(request, response, 'deleteProduct');
    if (!id) return Promise.resolve();

    // `hardDelete` is a boolean the route accepts three ways — see docs/theory/request-input.md.
    // The path form (`DELETE /products/:id/hard`) reaches `params` through `routeFlag`.
    const input = readInput(request, {
        sources: ['params', 'query', 'body'],
        booleans: ['hardDelete']
    });
    const parseResult = hardDeleteSchema.safeParse(input.hardDelete);
    if (!parseResult.success)
        return Promise.resolve(
            rejectResponse(
                response,
                422,
                'deleteProduct - invalid hardDelete',
                parseResult.error.issues.map(({ message }) => message)
            )
        );
    const hardDelete = parseResult.data;

    return (
        productService
            // true = hard-delete; false (default) = soft-delete (sets deletedAt)
            .removeById(id, hardDelete)
            .then((result) => {
                if (!result.success) {
                    rejectResponse(response, result.status, result.message, result.errors);
                    return;
                }
                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: AuditAction.ADMIN_PRODUCT_DELETED,
                        outcome: 'success',
                        target_type: 'product',
                        target_id: id,
                        metadata: { hardDelete }
                    })
                );
                successResponse(response, undefined, 200, result.message);
            })
            .catch((error: CastError) => {
                if (error.message === '404' || error.kind === 'ObjectId')
                    return rejectResponse(response, 404, 'deleteProduct - not found', [
                        t('ecommerce.product-not-found')
                    ]);
                rejectDatabaseError(response, 'deleteProduct', error);
            })
    );
};
