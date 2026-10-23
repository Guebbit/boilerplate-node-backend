/**
 * @module
 * `PUT /stock-alerts/:productId` controller — thin HTTP adapter over `stockAlertService.ask`.
 */

import type { Request, Response } from 'express';
import { requireId } from '@infrastructure/http/ids';
import { createdOrOk } from '@infrastructure/http/response';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { StockAlertsResponse } from '@types';
import { stockAlertService } from '../service';

/**
 * PUT /stock-alerts/:productId — ask to be told when the product can be ordered again.
 * "This request exists" is a yes/no state on a URI, so PUT states it: 201 when this call made the
 * request, 200 when it was already there (RFC 9110 §9.3.4).
 */
export const putStockAlert = (request: Request<{ productId: string }>, response: Response) => {
    const productId = requireId(request, response, {
        notFound: 'stock-alerts.product-not-found',
        name: 'productId'
    });
    if (!productId) return;

    return stockAlertService
        .ask(request.authContext!.id, productId)
        .then((result) => {
            if (refused(response, result)) return;
            createdOrOk<StockAlertsResponse>(
                response,
                result.data,
                result.status,
                `/stock-alerts/${productId}`,
                result.message
            );
        })
        .catch(catchAs(response, 'createStockAlert'));
};
