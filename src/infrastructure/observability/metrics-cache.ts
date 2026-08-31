/**
 * @module
 * Cache metrics (Prometheus).
 *
 * One counter, and it exists because a log line is not alertable. See `metrics-http.ts` for why
 * infrastructure registers its own metrics against the shared registry.
 *
 * See: docs/tools/prometheus.md
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from './metrics-http';

/**
 * Invalidations that could not reach Redis, by tag.
 *
 * The failure this makes visible: a write succeeds, its cached predecessor is NOT removed, and the
 * stale response is served for the endpoint's full TTL. The response has already been sent by the
 * time this is known, so observability is the only possible action — which is the point. A rate
 * above zero here means the catalogue is lying to somebody.
 */
export const cacheInvalidationFailuresTotal = new Counter({
    name: 'cache_invalidation_failures_total',
    help: 'Cache invalidations that could not reach Redis, so stale responses survive their write.',
    // Bounded by construction: tags are literals declared on the routes, never request data.
    labelNames: ['tag'] as const,
    registers: [metricsRegistry]
});
