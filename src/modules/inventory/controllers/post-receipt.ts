import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { ReceiveStockBody } from '@api/schemas.zod';
import { inventoryAuditActions } from '../audit';
import { inventoryService } from '../service';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';

/**
 * POST /inventory/receipts
 * Units arrive from a supplier. Audited: a receipt is one of only two ways units can enter the
 * shop, and the row says which admin added how many.
 */
export const postReceipt = (request: Request, response: Response) => {
    const parseResult = ReceiveStockBody.safeParse(request.body ?? {});
    if (!parseResult.success) {
        rejectValidation(response, parseResult.error);
        return Promise.resolve();
    }

    const { productId, quantity, note } = parseResult.data;
    return inventoryService
        .receive(productId, quantity, note)
        .then((result) => {
            if (refused(response, result)) return;
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: inventoryAuditActions.ADMIN_STOCK_RECEIVED,
                    outcome: 'success',
                    target_type: 'product',
                    target_id: productId,
                    metadata: { quantity, onHand: result.data?.onHand }
                })
            );
            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postReceipt'));
};
