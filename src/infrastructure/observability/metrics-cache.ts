/**
 * @module
 * Cache metrics (Prometheus). One counter, and it exists because a log line is not alertable.
 * Registers against the shared registry the same way every module's own `metrics.ts` does — see
 * `metrics-registry.ts`.
 *
 * See: docs/tools/prometheus.md
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from './metrics-registry';
import { counterConfig } from '@infrastructure/observability/metric-config';
import { infrastructureMetricData } from '@infrastructure/observability/metrics.generated';

/**
 * Invalidations that could not reach Redis, by tag.
 * Makes visible: a write succeeds, its cached predecessor is NOT removed, and the stale response
 * is served for the endpoint's full TTL — already sent by the time this is known, so
 * observability is the only possible action. A rate above zero means the catalogue is lying.
 */
export const cacheInvalidationFailuresTotal = new Counter({
    ...counterConfig(infrastructureMetricData.cacheInvalidationFailuresTotal),
    // Bounded by construction: tags are literals declared on the routes, never request data.
    registers: [metricsRegistry]
});

/**
 * `setCache` lookups by outcome — the only hit/miss signal this cache has. Without it, how big a
 * stampede's herd actually gets is arithmetic from traffic estimates, never an observed number.
 *
 * `hit`: fresh. `stale`: past soft expiry, served from the old body. `refresh`: past soft expiry,
 * this caller won the rebuild claim. `miss`: nothing cached at all.
 */
export const cacheRequestsTotal = new Counter({
    ...counterConfig(infrastructureMetricData.cacheRequestsTotal),
    // Bounded by construction: the four literals setCache's own branches produce.
    registers: [metricsRegistry]
});
