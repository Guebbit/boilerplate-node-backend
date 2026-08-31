/**
 * @module
 * POST /inventory/adjustments
 * A stocktake correction. THE audited endpoint of this module: an unexplained stock correction is
 * precisely what shrinkage looks like from the outside, so the row records the admin, the signed
 * delta and the reason they typed.
 */

import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { AdjustStockBody } from '@api/schemas.zod';
import { inventoryService } from '../service';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** Handles `POST /inventory/adjustments`. */
export const postAdjustment = (request: Request, response: Response) => {
    const body = parseBody(AdjustStockBody, request.body, response);
    if (!body) return;

    const { productId, delta, note } = body;
    // Zero can't be expressed as a schema constraint, so it's checked here.
    // Refused rather than silently accepted — a no-op would write a meaningless ledger row.
    if (delta === 0) {
        rejectResponse(response, 422, [t('inventory.adjust-zero')]);
        return Promise.resolve();
    }

    return inventoryService
        .adjust(productId, delta, note, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postAdjustment'));
};
