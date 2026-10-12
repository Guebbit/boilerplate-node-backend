/**
 * @module
 * The stats reads: one thin controller each, onto the shared handler in `./respond`. Every route
 * takes a shop-local period except the pipeline, which is a snapshot of right now.
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, namedHandler } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { blankToUndefined } from '@infrastructure/http/schemas';
import { statsService } from '../services';
import { intervalField, periodFields, statsHandler } from './respond';

/** `GET /stats/sales`. */
export const getSalesStats = statsHandler(
    'getSalesStats',
    z.strictObject({ ...periodFields, interval: intervalField }),
    (period) => statsService.getSalesStats(period)
);

/** `GET /stats/products`. */
export const getProductStats = statsHandler(
    'getProductStats',
    z.strictObject({
        ...periodFields,
        limit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(100).default(10))
    }),
    (period, query) => statsService.getProductStats(period, query.limit)
);

/** The series read itself, once the path's id is known to be an id. */
const productSeries = statsHandler(
    'getProductSalesSeries',
    z.strictObject({ ...periodFields, interval: intervalField }),
    (period, _query, request) =>
        statsService.getProductSeries(period, String(request.params.productId))
);

/** `GET /stats/products/:productId`: a malformed id is a product that does not exist, so 404. */
export const getProductSalesSeries = namedHandler(
    'getProductSalesSeries',
    (request: Request, response: Response) =>
        requireId(request, response, { notFound: 'stats.product-not-found', name: 'productId' })
            ? productSeries(request, response)
            : undefined
);

/** `GET /stats/categories`. */
export const getCategoryStats = statsHandler(
    'getCategoryStats',
    z.strictObject(periodFields),
    (period) => statsService.getCategoryStats(period)
);

/** `GET /stats/payments`. */
export const getPaymentMixStats = statsHandler(
    'getPaymentMixStats',
    z.strictObject(periodFields),
    (period) => statsService.getPaymentMix(period)
);

/** `GET /stats/operations`. */
export const getOperationsStats = statsHandler(
    'getOperationsStats',
    z.strictObject(periodFields),
    (period) => statsService.getOperationsStats(period)
);

/** `GET /stats/customers`. */
export const getCustomerStats = statsHandler(
    'getCustomerStats',
    z.strictObject(periodFields),
    (period) => statsService.getCustomerStats(period)
);

/** `GET /stats/pipeline` — a snapshot, no period. */
export const getPipelineStats = (_request: Request, response: Response) =>
    statsService
        .getPipelineStats()
        .then((data) => {
            successResponse(response, data);
        })
        .catch(catchAs(response, 'getPipelineStats'));
