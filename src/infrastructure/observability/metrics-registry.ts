/**
 * @module
 * The shared prom-client registry, and the process-wide metrics that describe the registry itself
 * rather than any one domain: default Node.js/process collectors, uptime, the heap ceiling, and
 * every crontab job's last outcome. Split from `metrics-http.ts` so a file named for HTTP is not
 * where every module's `metrics.ts` reaches for the registry it registers onto.
 *
 * See: docs/tools/opentelemetry.md
 */

import { getHeapStatistics } from 'node:v8';
import mongoose from 'mongoose';
import { register, Gauge, collectDefaultMetrics } from 'prom-client';
import { listLeaseSummaries } from '@infrastructure/persistence/lease';
import { connection } from '@infrastructure/runtime/database';

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
 * When each crontab-scheduled job (`docker/crontab`, run through `scripts/run-script.ts`) last
 * recorded a success — Prometheus's own "last success timestamp" pattern for batch jobs, from the
 * same `leases` rows `GET /observability/health`'s `jobs` field already reads. `collect()` does
 * I/O, unlike the two gauges above: the fact it reports happened in a DIFFERENT process, so there
 * is no in-memory value here to read instead. `reset()` first, so a job the TTL index has
 * reclaimed (`lease.ts`'s own retention window) stops being reported. A job that has never
 * succeeded is left unset, not `0` — the Unix epoch would fire a staleness alert on a fresh
 * deployment's first scrape, before the job ever had a chance to run.
 *
 * Skips the query entirely while Mongo is not connected rather than letting mongoose buffer it: an
 * unconnected model queues a command and waits out the driver's own buffering timeout before
 * rejecting, and a scrape must answer fast regardless of one dependency's state —
 * `dependencyHealth`'s own database read is a memory check for the same reason.
 */
const _jobLastSuccessGauge = new Gauge({
    name: 'job_last_success_timestamp_seconds',
    help: "Unix time of each crontab job's last recorded success.",
    labelNames: ['job'],
    registers: [metricsRegistry],
    collect() {
        this.reset();
        if (connection.readyState !== mongoose.ConnectionStates.connected) return;
        return listLeaseSummaries()
            .then((summaries) => {
                for (const summary of summaries)
                    if (summary.lastSuccessAt)
                        this.set({ job: summary.name }, summary.lastSuccessAt.getTime() / 1000);
            })
            .catch(() => undefined);
    }
});

/**
 * Serialize all registered metrics in Prometheus text format.
 * This is the body of the `/metrics` endpoint that Prometheus scrapes; `registry.metrics()`
 * runs every `collect()` hook and renders the whole registry.
 */
export const getPrometheusMetrics = (): Promise<string> => metricsRegistry.metrics();
