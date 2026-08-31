/**
 * @module
 * POST /inventory/receipts
 * Units arrive from a supplier. Audited: a receipt is one of only two ways units can enter the
 * shop, and the row says which admin added how many.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { ReceiveStockBody } from '@api/schemas.zod';
import { inventoryService } from '../service';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** Handles `POST /inventory/receipts`. */
export const postReceipt = (request: Request, response: Response) => {
    const body = parseBody(ReceiveStockBody, request.body, response);
    if (!body) return;

    const { productId, quantity, note } = body;
    return inventoryService
        .receive(productId, quantity, note, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postReceipt'));
};
