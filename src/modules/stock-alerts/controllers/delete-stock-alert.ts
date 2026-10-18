/**
 * @module
 * `DELETE /stock-alerts/:productId` controller — thin HTTP adapter over `stockAlertService.cancel`.
 */

import type { Request, Response } from 'express';
import { requireId } from '@infrastructure/http/ids';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { StockAlertsResponse } from '@types';
import { stockAlertService } from '../service';

/** DELETE /stock-alerts/:productId — cancel the caller's own request before it is answered. */
export const deleteStockAlert = (request: Request<{ productId: string }>, response: Response) => {
    const productId = requireId(request, response, {
        notFound: 'stock-alerts.not-found',
        name: 'productId'
    });
    if (!productId) return;

    return stockAlertService
        .cancel(request.authContext!.id, productId)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<StockAlertsResponse>(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'deleteStockAlert'));
};
