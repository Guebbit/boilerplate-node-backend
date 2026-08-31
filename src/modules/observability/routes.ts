/**
 * @module
 * Route table for the operator dashboard. Guards are chosen per route rather than shared, because
 * `/events` and `/metrics` are reached by callers that cannot carry the ordinary admin JWT — a
 * browser's `EventSource` and a Prometheus scraper, respectively. The other three routes take the
 * normal `getAuth`/`isAuth`/`isAdmin` chain.
 *
 * See: docs/modules/observability.md
 */

import { Router } from 'express';
import { getAuth, isAuth, isAdmin, isAdminViaCookie } from '@kernel/middlewares/authorizations';
import { isMetricsScraper } from '@infrastructure/http/middlewares/rate-limit';
import { getObservabilityHealth } from './controllers/get-observability-health';
import { getObservabilityMetricsOverview } from './controllers/get-observability-metrics-overview';
import { getObservabilityAuditLogs } from './controllers/get-observability-audit';
import { getPrometheusMetrics, metricsRegistry } from '@infrastructure/observability/metrics-http';
import { streamObservabilityMetrics } from '@infrastructure/observability/stream';
import { logger } from '@infrastructure/adapters/logger';

/** Express router for observability endpoints mounted at /observability. */
export const router = Router();

/*
 * Both of these are authenticated. Neither carries user data, but both are a map of how the
 * service behaves — request volumes, error rates, latency percentiles, login success/failure
 * counters, uptime and heap — which is reconnaissance worth having if you intend to attack it.
 *
 * They authenticate differently because their callers can authenticate differently: the SSE
 * stream is opened by a browser's `EventSource`, which cannot set a header and must use the
 * session cookie; the metrics endpoint is scraped by Prometheus, which cannot log in and must
 * use a static credential. See `isAdminViaCookie` and `isMetricsScraper`.
 */
router.get('/events', isAdminViaCookie, (_request, response) => {
    streamObservabilityMetrics(response);
});

router.get('/metrics', isMetricsScraper, (_request, response) => {
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

/* Endpoints a normal API client calls — admin JWT required. */
router.get('/health', getAuth, isAuth, isAdmin, getObservabilityHealth);
router.get('/metrics/overview', getAuth, isAuth, isAdmin, getObservabilityMetricsOverview);
router.get('/audit', getAuth, isAuth, isAdmin, getObservabilityAuditLogs);
