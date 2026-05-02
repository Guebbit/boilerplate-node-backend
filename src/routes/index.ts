import { Router } from 'express';
import { successResponse } from '@utils/response';
import { getHeavyLoad } from '@controllers/_development/get-heavy-load';
import { getPrometheusMetrics, prometheusContentType } from '@utils/observability';

export const router = Router();

/**
 * Only in development
 */
if (process.env.NODE_ENV !== 'production') router.get('/heavy', getHeavyLoad);

/**
 * GET /
 * Health-check / welcome endpoint.
 */
router.get('/', (request, response) => {
    successResponse(response, { status: 'ok' }, 200, 'API is running');
});

/**
 * GET /metrics
 * Prometheus-compatible metrics endpoint.
 * Scraped by Prometheus on its configured interval (default 15s).
 */
router.get('/metrics', (_request, response) => {
    return getPrometheusMetrics().then((metrics) => {
        response.setHeader('Content-Type', prometheusContentType);
        response.send(metrics);
    });
});
