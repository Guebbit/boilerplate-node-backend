/**
 * @module
 * `POST /stock-alerts/:productId` controller — thin HTTP adapter over `stockAlertService.ask`.
 */

import type { Request, Response } from 'express';
import { requireId } from '@infrastructure/http/ids';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { StockAlertsResponse } from '@types';
import { stockAlertService } from '../service';

/** POST /stock-alerts/:productId — ask to be told when the product can be ordered again. */
export const postStockAlert = (request: Request<{ productId: string }>, response: Response) => {
    const productId = requireId(request, response, {
        notFound: 'stock-alerts.product-not-found',
        name: 'productId'
    });
    if (!productId) return;

    return stockAlertService
        .ask(request.authContext!.id, productId)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<StockAlertsResponse>(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postStockAlert'));
};
