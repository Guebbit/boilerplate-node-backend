/**
 * @module
 * Route table for the operator dashboard. Guards are chosen per route rather than shared, because
 * `/events` and `/metrics` are reached by callers that cannot carry the ordinary admin JWT — a
 * browser's `EventSource` and a Prometheus scraper, respectively. The other three routes take the
 * normal `getAuth`/`isAuth`/`requirePermission(...)` chain.
 *
 * See: docs/modules/observability.md
 */

import { Router } from 'express';
import {
    getAuth,
    isAuth,
    requirePermission,
    requirePermissionViaCookie,
    stillHoldsKeyViaCookie
} from '@kernel/middlewares/authorizations';
import { isMetricsScraper } from './metrics-scraper';
import { getObservabilityHealth } from './controllers/get-observability-health';
import { getObservabilityMetricsOverview } from './controllers/get-observability-metrics-overview';
import { getObservabilityAuditLogs } from './controllers/get-observability-audit';
import {
    getPrometheusMetrics,
    metricsRegistry
} from '@infrastructure/observability/metrics-registry';
import { streamObservabilityMetrics } from './stream';
import { logger } from '@infrastructure/adapters/logger';

/** Express router for observability endpoints mounted at /observability. */
export const router = Router();

/** The one key every route in this module guards on. */
const OBSERVABILITY_READ_KEY = 'platform.observability.any.read';

/*
 * Both authenticated, though neither carries user data — both expose request volumes, error
 * rates, latency, login counters, uptime and heap, reconnaissance worth having before an attack.
 * They authenticate differently because their callers must: the SSE stream is opened by a
 * browser's `EventSource`, which can't set a header and so uses the session cookie; the scrape
 * endpoint is hit by Prometheus, which can't log in and so uses a static credential.
 *
 * `/events` also re-checks the permission every 30 seconds for as long as the stream stays open —
 * the one place in this codebase where a revoked caller does not lose access on their very next
 * request, because there is no next request until this recheck ends the stream. See
 * `stillHoldsKeyViaCookie` and `streamObservabilityMetrics`.
 */
router.get('/events', requirePermissionViaCookie(OBSERVABILITY_READ_KEY), (request, response) => {
    // Guaranteed present and valid: `requirePermissionViaCookie` above already required it to
    // resolve a key-holding caller, or this handler would never run.
    const refreshToken = (request.cookies as Record<string, string | undefined>).jwt!;

    streamObservabilityMetrics(response, () =>
        stillHoldsKeyViaCookie(request, refreshToken, OBSERVABILITY_READ_KEY)
    );
});

router.get('/metrics', isMetricsScraper, (_request, response) => {
    void getPrometheusMetrics()
        .then((metrics) => {
            response.setHeader('Content-Type', metricsRegistry.contentType);
            response.send(metrics);
        })
        .catch((error: unknown) => {
            logger.error('Failed to collect Prometheus metrics', { error });
            response.status(500).send('# metrics unavailable\n');
        });
});

/* Endpoints a normal API client calls — admin JWT required. */
router.get(
    '/health',
    getAuth,
    isAuth,
    requirePermission(OBSERVABILITY_READ_KEY),
    getObservabilityHealth
);
router.get(
    '/metrics/overview',
    getAuth,
    isAuth,
    requirePermission(OBSERVABILITY_READ_KEY),
    getObservabilityMetricsOverview
);
router.get(
    '/audit',
    getAuth,
    isAuth,
    requirePermission(OBSERVABILITY_READ_KEY),
    getObservabilityAuditLogs
);
