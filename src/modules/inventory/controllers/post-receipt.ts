/**
 * @module
 * POST /inventory/receipts
 * Units arrive from a supplier. Audited: a receipt is one of only two ways units can enter the
 * shop, and the row says which admin added how many.
 */

import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { ReceiveStockBody } from '@api/schemas.zod';
import { inventoryService } from '../service';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import type { InventoryLevel } from '@types';

/** Handles `POST /inventory/receipts`. */
export const postReceipt = (request: Request, response: Response) => {
    const body = parseBody(ReceiveStockBody, request.body, response);
    if (!body) return;

    const { productId, quantity, note } = body;
    return inventoryService
        .receive(productId, quantity, note, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            // `ResponseSuccess.data` is optional at the type level for endpoints with no payload;
            // `receive` always resolves one on success, so this is exhaustiveness.
            if (!result.data) return rejectResponse(response, 500, [t('generic.error-internal')]);
            successResponse<InventoryLevel>(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postReceipt'));
};
