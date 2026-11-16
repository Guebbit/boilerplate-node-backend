/**
 * @module
 * Database metrics (Prometheus). One counter: a query killed at its time limit is a 503 like an
 * outage, so without its own series the 5xx alert cannot tell "slow" from "down".
 *
 * @see docs/operate/prometheus.md#what-observability-metrics-exposes
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from './metrics-registry';
import { counterConfig } from '@infrastructure/observability/metric-config';
import { infrastructureMetricData } from '@infrastructure/observability/metrics.generated';

/**
 * Queries mongod stopped at `maxTimeMS` (error 50), counted where the answer is derived.
 * A rate above zero means a query shape is too slow for the limit, or the database is saturated.
 */
export const queryTimeoutsTotal = new Counter({
    ...counterConfig(infrastructureMetricData.queryTimeoutsTotal),
    // Unlabelled: one number is the signal; the log line carries the operation name.
    registers: [metricsRegistry]
});
