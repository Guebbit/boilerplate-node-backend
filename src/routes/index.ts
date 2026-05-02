import { Router } from 'express';
import { successResponse } from '@utils/response';
import { getHeavyLoad } from '@controllers/_development/get-heavy-load';
import { getPrometheusMetrics, metricsRegistry } from '@utils/observability';

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
 * Returns text/plain (Prometheus exposition format 0.0.4).
 */
router.get('/metrics', (_request, response) => {
    void getPrometheusMetrics().then((metrics) => {
        response.setHeader('Content-Type', metricsRegistry.contentType);
        response.send(metrics);
    });
});
