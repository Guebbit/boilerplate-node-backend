import { Router } from 'express';
import mongoose from 'mongoose';
import { successResponse, rejectResponse } from '@utils/response';
import { getHeavyLoad } from '@controllers/_development/get-heavy-load';
import { getPrometheusMetrics, metricsRegistry } from '@utils/observability';
import { pingCache } from '@utils/cache';
import { streamObservabilityMetrics } from '@utils/realtime-observability';

export const router = Router();

if (process.env.NODE_ENV !== 'production') router.get('/heavy', getHeavyLoad);

/** Liveness — always 200 if the process is up. Used by k8s and Docker healthchecks. */
router.get('/healthz', (_request, response) => {
    successResponse(response, { status: 'ok' }, 200, 'alive');
});

/** Readiness — 200 only when Mongo + Redis are reachable. */
router.get('/readyz', (_request, response) => {
    const mongoUp = mongoose.connection.readyState === 1;
    void pingCache().then((redisUp) => {
        const allUp = mongoUp && redisUp;
        const data = {
            mongo: mongoUp ? 'up' : 'down',
            redis: redisUp ? 'up' : 'down'
        };
        if (allUp) successResponse(response, data, 200, 'ready');
        else rejectResponse(response, 503, 'not ready', [JSON.stringify(data)]);
    });
});

/** Welcome / quick browser check. */
router.get('/', (_request, response) => {
    successResponse(response, { status: 'ok' }, 200, 'API is running');
});

/** Prometheus exposition endpoint (text/plain). */
router.get('/metrics', (_request, response) => {
    void getPrometheusMetrics()
        .then((metrics) => {
            response.setHeader('Content-Type', metricsRegistry.contentType);
            response.send(metrics);
        })
        .catch(() => {
            response.status(500).send('# metrics unavailable\n');
        });
});

/** SSE observability stream for live demos/dashboards. */
router.get('/observability/events', (_request, response) => {
    streamObservabilityMetrics(response);
});
