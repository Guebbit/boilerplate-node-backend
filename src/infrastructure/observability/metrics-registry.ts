/**
 * @module
 * The shared prom-client registry, and the process-wide metrics that describe the registry itself
 * rather than any one domain: default Node.js/process collectors, uptime, and the heap ceiling.
 * Split from `metrics-http.ts` so a file named for HTTP is not where every module's `metrics.ts`
 * reaches for the registry it registers onto.
 *
 * See: docs/tools/opentelemetry.md
 */

import { getHeapStatistics } from 'node:v8';
import { register, Gauge, collectDefaultMetrics } from 'prom-client';

/**
 * Shared prom-client registry. `register` is the library's default global registry, the
 * collection `/metrics` serializes — re-exported under a project name so each module's
 * `metrics.ts` registers against the same instance instead of creating its own invisible one.
 * Also how `GET /observability/metrics/overview` reaches domain counters, by name off this
 * registry rather than importing the owning module.
 */
export const metricsRegistry = register;

// Default Node.js / process metrics (CPU, memory, event loop, GC, ...).
// One call, and prom-client installs a large set of runtime collectors — including
// `nodejs_eventloop_lag_seconds`, which is the single best indicator of a blocked event loop.
collectDefaultMetrics({ register: metricsRegistry });

/**
 * prom-client omits process_uptime_seconds; add it so dashboards can show uptime.
 * Assigned to an unused underscore-prefixed variable purely to satisfy lint rules: the
 * constructor's side effect (registering itself) is the whole point, not the reference.
 */
// Gauge: name follows Prometheus's snake_case/_seconds convention; help is mandatory and shown
// verbatim as `# HELP`; collect() runs at scrape time (non-arrow so `this` is the gauge).
const _processUptimeGauge = new Gauge({
    name: 'process_uptime_seconds',
    help: 'Uptime of the Node.js process in seconds.',
    registers: [metricsRegistry],
    collect() {
        this.set(process.uptime());
    }
});

/**
 * The ceiling V8 will not grow the heap past, in bytes.
 *
 * prom-client ships `used`/`total` but not this: `total` is heap V8 has committed so far and
 * grows on demand, so `used / total` sits near 1 on a healthy process — an alert on that ratio
 * fires permanently. `heap_size_limit` is the fixed ceiling, so `used / limit` is what actually
 * means "close to OOM" (see `HighHeapUsage` in `prometheus.alert-rules.yaml`).
 */
const _heapSizeLimitGauge = new Gauge({
    name: 'nodejs_heap_size_limit_bytes',
    help: 'Maximum heap size V8 will allocate for this process, in bytes.',
    registers: [metricsRegistry],
    collect() {
        this.set(getHeapStatistics().heap_size_limit);
    }
});

/**
 * Serialize all registered metrics in Prometheus text format.
 * This is the body of the `/metrics` endpoint that Prometheus scrapes; `registry.metrics()`
 * runs every `collect()` hook and renders the whole registry.
 */
export const getPrometheusMetrics = (): Promise<string> => metricsRegistry.metrics();
