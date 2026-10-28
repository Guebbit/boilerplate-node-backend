/**
 * @module
 * Process-level metrics (Prometheus). One counter, because an unhandled rejection is survived on
 * purpose (see `handleUnhandledRejection`) and a survived failure nobody counts is invisible.
 * Registers against the shared registry — see `metrics-registry.ts`.
 *
 * See: docs/tools/prometheus.md
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from './metrics-registry';
import { counterConfig } from '@infrastructure/observability/metric-config';
import { infrastructureMetricData } from '@infrastructure/observability/metrics.generated';

/**
 * Promise rejections no handler caught. Any rate above zero is a bug: a lost error, and whatever
 * work the promise was meant to finish.
 */
export const processUnhandledRejectionsTotal = new Counter({
    ...counterConfig(infrastructureMetricData.processUnhandledRejectionsTotal),
    registers: [metricsRegistry]
});
