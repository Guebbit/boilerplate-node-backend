/**
 * @module
 * `GET /stock-alerts` controller — thin HTTP adapter over `stockAlertService.list`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import type { StockAlertsResponse } from '@types';
import { stockAlertService } from '../service';

/** GET /stock-alerts — the caller's own requests, newest first. */
export const getStockAlerts = (request: Request, response: Response) =>
    stockAlertService
        .list(request.authContext!.id)
        .then((view) => {
            successResponse<StockAlertsResponse>(response, view);
        })
        .catch(catchAs(response, 'getStockAlerts'));
