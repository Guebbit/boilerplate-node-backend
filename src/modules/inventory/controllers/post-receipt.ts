/**
 * @module
 * POST /inventory/levels/:productId/receive
 * Units arrive from a supplier. Audited: a receipt is one of only two ways units can enter the
 * shop, and the row says which admin added how many.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { ReceiveStockBody } from '@api/schemas.zod';
import { requireId } from '@infrastructure/http/ids';
import { inventoryService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import type { InventoryLevel } from '@types';

/** Handles `POST /inventory/levels/:productId/receive`. */
export const postReceipt = (request: Request<{ productId?: string }>, response: Response) => {
    const productId = requireId(request, response, {
        name: 'productId',
        notFound: 'inventory.product-not-found'
    });
    if (!productId) return Promise.resolve();

    const body = parseBody(ReceiveStockBody, request.body, response);
    if (!body) return Promise.resolve();

    const { quantity, note } = body;
    return inventoryService
        .receive(productId, quantity, note, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<InventoryLevel>(response, result.data, 200);
        })
        .catch(catchAs(response, 'postReceipt'));
};
