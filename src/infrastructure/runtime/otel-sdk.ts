/**
 * OpenTelemetry SDK bootstrap.
 *
 * This module must be imported *before* any instrumented library (express, mongoose, redis)
 * actually handles traffic: the instrumentation packages patch those modules at `sdk.start()`
 * time, so anything already running keeps the un-patched code path and produces no spans.
 *
 * See: docs/tools/opentelemetry.md
 */

// `NodeSDK` = the all-in-one OTel entry point for Node: it wires resource, span processors,
// instrumentations and context propagation together, so we do not configure a TracerProvider by hand.
import { NodeSDK } from '@opentelemetry/sdk-node';
// `resourceFromAttributes` builds the immutable "who is emitting this telemetry" descriptor
// (service name/version/host) that gets attached to every exported span.
import { resourceFromAttributes } from '@opentelemetry/resources';
// Well-known attribute keys. Using the constants instead of raw strings ('service.name')
// keeps us aligned with the OTel semantic-conventions spec, which backends rely on for grouping.
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
// `BatchSpanProcessor` queues finished spans and exports them in batches on a timer,
// instead of one HTTP call per span (SimpleSpanProcessor). `SpanProcessor` is the interface type.
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-node';
// `OTLPTraceExporter` speaks OTLP over HTTP/protobuf — the vendor-neutral wire format
// understood by Jaeger, Tempo, Honeycomb, Datadog, the OTel Collector, etc.
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
// Auto-instrumentations: each one monkey-patches its target library so spans are created
// without touching business code. Only the four libraries this app actually uses are loaded,
// which keeps startup cost lower than the `@opentelemetry/auto-instrumentations-node` bundle.
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';

/** The single SDK instance. Kept at module scope so `shutdownTracing()` can flush the same object. */
let sdk: NodeSDK | undefined;

/**
 * Idempotency guard. `sdk.start()` patches global modules, so a second call would
 * double-register instrumentations (duplicated spans). Cluster workers each import this
 * module in their own process, so the flag is per-process — which is what we want.
 */
let started = false;

/**
 * Build the OTLP processor when an endpoint is configured.
 *
 * Returning an empty array is a deliberate no-op mode: without `OTEL_EXPORTER_OTLP_ENDPOINT`
 * the SDK still runs (spans are created, `traceId` is available for log correlation) but
 * nothing is shipped anywhere. That is what keeps local dev and tests quiet.
 */
const buildProcessors = (): SpanProcessor[] => {
    // Standard OTel env var, e.g. `http://localhost:4318` (collector) — base URL only, no path.
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!otlpEndpoint) return [];

    return [
        new BatchSpanProcessor(
            new OTLPTraceExporter({
                // OTLP/HTTP mandates the `/v1/traces` suffix; the env var holds only the base.
                url: `${otlpEndpoint}/v1/traces`,
                // Optional auth/tenant headers, supplied as `key=value,key2=value2`
                // (the format the OTel spec defines for OTEL_EXPORTER_OTLP_HEADERS).
                // Parsed here into the `Record<string, string>` the exporter expects.
                headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
                    ? Object.fromEntries(
                          process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',').map(
                              (header): [string, string] => {
                                  const [key = '', value = ''] = header
                                      .split('=')
                                      .map((part) => part.trim());
                                  return [key, value];
                              }
                          )
                      )
                    : {}
            })
        )
    ];
};

/** Start the OpenTelemetry SDK. Safe to call multiple times. */
export const startTracing = (): void => {
    if (started) return;
    started = true;

    // Identity stamped on every span. Without a service name most backends bucket the
    // traces under "unknown_service", making them impossible to tell apart from other apps.
    const resource = resourceFromAttributes({
        // `service.name` — primary grouping key in every tracing UI.
        [ATTR_SERVICE_NAME]: process.env.NODE_SERVICE_NAME ?? 'api',
        // `service.version` — npm injects `npm_package_version` when started via an npm script,
        // which lets you correlate a latency/error regression with a specific release.
        [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0'
    });

    // Instantiate the SDK. Nothing is patched or exported yet — that happens in `start()` below.
    sdk = new NodeSDK({
        // Attributes merged into every span produced by this process (see `resource` above).
        resource,
        // Export pipeline. Empty array = spans are created but dropped instead of shipped.
        spanProcessors: buildProcessors(),
        // Libraries to auto-instrument. Order is irrelevant; each patches a different module.
        instrumentations: [
            // Inbound/outbound HTTP: creates the root SERVER span per request and
            // injects/extracts the W3C `traceparent` header so traces span services.
            new HttpInstrumentation(),
            // Express: adds child spans per middleware and per route handler, and supplies
            // the route template (`/products/:id`) that keeps span names low-cardinality.
            new ExpressInstrumentation(),
            // Mongoose: one span per query with collection, operation and (optionally) filter.
            new MongooseInstrumentation(),
            // Redis: one span per command — makes cache hit/miss latency visible in the trace.
            new RedisInstrumentation()
        ]
    });

    // Applies the monkey-patches and starts the exporter's background flush timer.
    sdk.start();
};

/**
 * Flush pending spans and shut down the SDK cleanly.
 *
 * `BatchSpanProcessor` holds spans in memory between flushes, so skipping this on exit
 * loses the last few seconds of telemetry — exactly the spans covering a crash.
 * Called last in the shutdown chain (see `bootstrap/server-lifecycle.ts`) so infra
 * teardown is itself still traced.
 */
export const shutdownTracing = (): Promise<void> => {
    if (!sdk) return Promise.resolve();
    return sdk.shutdown();
};
