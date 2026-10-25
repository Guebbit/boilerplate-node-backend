/**
 * @module
 * GET /inventory/levels/:productId
 * One product's counters and availability.
 */

import type { Request, Response } from 'express';
import type { InventoryLevel } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import { inventoryService } from '../services';

/** Handles `GET /inventory/levels/:productId`. */
export const getInventoryLevel = (request: Request<{ productId?: string }>, response: Response) => {
    const productId = requireId(request, response, {
        name: 'productId',
        notFound: 'inventory.product-not-found'
    });
    if (!productId) return Promise.resolve();

    return inventoryService
        .getLevel(productId)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<InventoryLevel>(response, result.data);
        })
        .catch(catchAs(response, 'getInventoryLevel'));
};
