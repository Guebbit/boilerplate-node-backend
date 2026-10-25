/**
 * @module
 * `POST /stock-alerts` controller — thin HTTP adapter over `stockAlertService.ask`.
 */

import type { Request, Response } from 'express';
import { CreateStockAlertBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import type { CreateStockAlertRequest, StockAlertsResponse } from '@types';
import { stockAlertService } from '../service';

/**
 * POST /stock-alerts
 * Ask to be told when the product can be ordered again. The parent is the list itself, so the
 * answer is 200 + the whole list; repeating the request is the same request.
 */
export const postStockAlerts = (
    request: Request<unknown, unknown, CreateStockAlertRequest>,
    response: Response
) => {
    // `parseBody` refuses a `productId` that is not this backend's id (422).
    const body = parseBody(CreateStockAlertBody, request.body, response);
    if (!body) return;

    return stockAlertService
        .ask(request.authContext!.id, body.productId)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<StockAlertsResponse>(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'createStockAlert'));
};
