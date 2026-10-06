/**
 * @module
 * Rate-limit metrics (Prometheus). Two counters, because a log line is not alertable: an outage is
 * logged once, but how many requests were served from the fallback, or refused, is a number.
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

/**
 * Requests a budget refused with a 429, by budget namespace.
 * Makes visible: a scanner or a credential-stuffing run against one budget, including the global
 * brake, which writes no audit entry. A sustained rate is the alert signal.
 */
export const rateLimitRefusalsTotal = new Counter({
    name: 'rate_limit_refusals_total',
    help: 'Requests refused with 429 by a rate-limit budget.',
    // Bounded by construction: namespaces are literals declared on the budgets, never request data.
    labelNames: ['budget'] as const,
    registers: [metricsRegistry]
});
