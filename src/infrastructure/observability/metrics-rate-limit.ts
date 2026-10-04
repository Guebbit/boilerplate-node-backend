/**
 * @module
 * Rate-limit metrics (Prometheus). One counter, and it exists because a log line is not alertable:
 * the outage is logged once, but how many requests were served from the fallback is a number.
 * Registers against the shared registry like every module's own `metrics.ts` — see
 * `metrics-registry.ts`.
 *
 * See: docs/tools/prometheus.md
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from './metrics-registry';

/**
 * Store operations that could not use the `limits` Redis, by budget namespace.
 * Makes visible: a budget counting in this process alone (one budget per worker, not one for the
 * deployment), or a budget letting requests through unbudgeted. A rate above zero means a limit is
 * weaker than configured.
 */
export const rateLimitStoreFallbackTotal = new Counter({
    name: 'rate_limit_store_fallback_total',
    help: 'Rate-limit store operations served without the limits Redis, so budgets are per process or open.',
    // Bounded by construction: namespaces are literals declared on the budgets, never request data.
    labelNames: ['namespace'] as const,
    registers: [metricsRegistry]
});
