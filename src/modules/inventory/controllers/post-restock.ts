import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { RestockProductBody } from '@api/schemas.zod';
import { inventoryAuditActions } from '../audit';
import { inventoryService } from '../service';

/**
 * POST /inventory/restock
 * Units arrive on a shelf. Audited: stock corrections are the classic place shrinkage hides,
 * and the row says which admin put how many units where.
 */
export const postRestock = (request: Request, response: Response) => {
    const parseResult = RestockProductBody.safeParse(request.body ?? {});
    if (!parseResult.success) {
        rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );
        return Promise.resolve();
    }

    const { productId, quantity } = parseResult.data;
    return inventoryService
        .restock(productId, quantity)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: inventoryAuditActions.ADMIN_STOCK_RESTOCKED,
                    outcome: 'success',
                    target_type: 'product',
                    target_id: productId,
                    metadata: { quantity }
                })
            );
            successResponse(response, result.data, 200, result.message);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'postRestock', error);
        });
};
