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
    requirePermissionViaCookie
} from '@kernel/middlewares/authorizations';
import { isMetricsScraper } from './metrics-scraper';
import { getObservabilityHealth } from './controllers/get-observability-health';
import { getObservabilityMetricsOverview } from './controllers/get-observability-metrics-overview';
import { getObservabilityAuditLogs } from './controllers/get-observability-audit';
import { getObservabilityMetrics } from './controllers/get-observability-metrics';
import {
    getObservabilityEvents,
    OBSERVABILITY_READ_KEY
} from './controllers/get-observability-events';

/** Express router for observability endpoints mounted at /observability. */
export const router = Router();

/*
 * Both authenticated, though neither carries user data — both expose request volumes, error
 * rates, latency, login counters, uptime and heap, reconnaissance worth having before an attack.
 * They authenticate differently because their callers must: the SSE stream is opened by a
 * browser's `EventSource`, which can't set a header and so uses the session cookie; the scrape
 * endpoint is hit by Prometheus, which can't log in and so uses a static credential.
 */
router.get(
    '/events',
    requirePermissionViaCookie(OBSERVABILITY_READ_KEY),
    getObservabilityEvents
);

router.get('/metrics', isMetricsScraper, getObservabilityMetrics);

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
