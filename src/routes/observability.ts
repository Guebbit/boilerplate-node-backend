import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { getObservabilityHealth } from '@controllers/observability/get-observability-health';
import { getObservabilityMetricsOverview } from '@controllers/observability/get-observability-metrics-overview';
import { getObservabilityAuditLogs } from '@controllers/observability/get-observability-audit';
import { getPrometheusMetrics, metricsRegistry } from '@utils/observability';
import { streamObservabilityMetrics } from '@utils/realtime-observability';
import { logger } from '@utils/winston';

/** Express router for observability endpoints mounted at /observability. */
export const router = Router();

/* Public endpoints — no authentication required. */
router.get('/events', (_request, response) => {
    streamObservabilityMetrics(response);
});

router.get('/metrics', (_request, response) => {
    void getPrometheusMetrics()
        .then((metrics) => {
            response.setHeader('Content-Type', metricsRegistry.contentType);
            response.send(metrics);
        })
        .catch((error: Error) => {
            logger.error('Failed to collect Prometheus metrics', { error: error.message });
            response.status(500).send('# metrics unavailable\n');
        });
});

/* Protected endpoints — admin JWT required. */
router.get('/health', getAuth, isAuth, isAdmin, getObservabilityHealth);
router.get('/metrics/overview', getAuth, isAuth, isAdmin, getObservabilityMetricsOverview);
router.get('/audit', getAuth, isAuth, isAdmin, getObservabilityAuditLogs);
