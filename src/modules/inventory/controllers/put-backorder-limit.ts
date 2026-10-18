/**
 * @module
 * PUT /inventory/levels/:productId/backorder-limit
 * Sets how many units of a product may be backordered at once. Audited: it is the cap the shop's
 * promise to buyers is made under.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { SetBackorderLimitBody } from '@api/schemas.zod';
import { inventoryService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import type { InventoryLevel } from '@types';

/** Handles `PUT /inventory/levels/:productId/backorder-limit`. */
export const putBackorderLimit = (request: Request<{ productId?: string }>, response: Response) => {
    const productId = requireId(request, response, {
        name: 'productId',
        notFound: 'inventory.product-not-found'
    });
    if (!productId) return Promise.resolve();

    const body = parseBody(SetBackorderLimitBody, request.body, response);
    if (!body) return Promise.resolve();

    return inventoryService
        .setBackorderLimit(productId, body.backorderLimit, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<InventoryLevel>(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'putBackorderLimit'));
};
