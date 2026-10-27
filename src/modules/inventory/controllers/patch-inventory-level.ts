/**
 * @module
 * PATCH /inventory/levels/:productId
 * Edits a product's stock level. The preorder limit is its only editable field; it is audited
 * because it is the cap the shop's promise to buyers is made under.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { UpdateInventoryLevelBody } from '@api/schemas.zod';
import { inventoryService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import type { InventoryLevel } from '@types';

/** Handles `PATCH /inventory/levels/:productId`. */
export const patchInventoryLevel = (
    request: Request<{ productId?: string }>,
    response: Response
) => {
    const productId = requireId(request, response, {
        name: 'productId',
        notFound: 'inventory.product-not-found'
    });
    if (!productId) return Promise.resolve();

    const body = parseBody(UpdateInventoryLevelBody, request.body, response);
    if (!body) return Promise.resolve();

    // A merge patch that names no field changes nothing: answer the level as it is, no write, no audit.
    const edit =
        body.backorderLimit === undefined
            ? inventoryService.getLevel(productId)
            : inventoryService.setBackorderLimit(
                  productId,
                  body.backorderLimit,
                  callerContextOf(request)
              );

    return edit
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<InventoryLevel>(response, result.data, 200);
        })
        .catch(catchAs(response, 'patchInventoryLevel'));
};
