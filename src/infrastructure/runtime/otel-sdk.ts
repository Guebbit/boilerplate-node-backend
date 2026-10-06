/**
 * @module
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
// `core` is `@opentelemetry/core` re-exported, so the propagators below need no dependency of their own.
import { NodeSDK, core } from '@opentelemetry/sdk-node';
// `resourceFromAttributes` builds the immutable "who is emitting this telemetry" descriptor
// (service name/version/host) that gets attached to every exported span.
import { resourceFromAttributes } from '@opentelemetry/resources';
// Well-known attribute keys. Using the constants instead of raw strings ('service.name')
// keeps us aligned with the OTel semantic-conventions spec, which backends rely on for grouping.
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
// `BatchSpanProcessor` queues finished spans and exports them in batches on a timer,
// instead of one HTTP call per span (SimpleSpanProcessor). `SpanProcessor` is the interface type.
// From `@opentelemetry/sdk-trace`, not the `-node` package: the latter now only re-exports the
// former and its own README points callers there directly.
import {
    BatchSpanProcessor,
    NoopSpanProcessor,
    type SpanProcessor
} from '@opentelemetry/sdk-trace';
// `OTLPTraceExporter` speaks OTLP over HTTP/protobuf — the vendor-neutral wire format
// understood by Jaeger, Tempo, Honeycomb, Datadog, the OTel Collector, etc.
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
// Relative: this file loads first, before anything that resolves path aliases is wired.
import { loggingConfig, tracingConfig } from './config';
// Auto-instrumentations: each one monkey-patches its target library so spans are created
// without touching business code. Only the four libraries this app actually uses are loaded,
// which keeps startup cost lower than the `@opentelemetry/auto-instrumentations-node` bundle.
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IncomingMessage, type ClientRequest } from 'node:http';
import {
    ROOT_CONTEXT,
    defaultTextMapGetter,
    trace,
    type Span,
    type TextMapPropagator
} from '@opentelemetry/api';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';

/**
 * Query parameters no span may carry in clear: the OAuth callback's one-time `code` and its CSRF
 * `state`, which the HTTP instrumentation otherwise records in the span's URL attributes.
 */
const QUERY_SECRETS = ['code', 'state'];

/**
 * `target` (a path plus query) with every {@link QUERY_SECRETS} value replaced by `REDACTED`;
 * returned as-is when it carries none.
 *
 * @param target - the request target, e.g. `/account/oauth/google/callback?code=…&state=…`
 */
export const redactUrlSecrets = (target: string): string => {
    const url = new URL(target, 'http://placeholder');
    const secrets = QUERY_SECRETS.filter((name) => url.searchParams.has(name));
    if (secrets.length === 0) return target;
    for (const name of secrets) url.searchParams.set(name, 'REDACTED');
    return `${url.pathname}${url.search}`;
};

/**
 * Overwrite an incoming span's URL attributes, both semantic-convention generations, when the
 * request's query carries a secret.
 *
 * @param span - the span the instrumentation just started
 * @param request - the incoming request; outgoing ones are left alone
 */
const redactIncomingUrl = (span: Span, request: ClientRequest | IncomingMessage): void => {
    if (!(request instanceof IncomingMessage) || !request.url) return;
    const target = redactUrlSecrets(request.url);
    if (target === request.url) return;
    span.setAttributes({
        'http.target': target,
        'http.url': `http://${request.headers.host ?? 'localhost'}${target}`,
        'url.query': target.split('?', 2)[1] ?? ''
    });
};

/**
 * The propagator for an API reachable by anyone: it injects `traceparent` on outgoing calls but
 * never ADOPTS an inbound one, and never reads `baggage`.
 *
 * A caller-chosen trace id would let anyone graft requests onto another trace, force sampling
 * with a `-01` flag, or fill our baggage. The inbound id is kept as a span link instead — see
 * {@link linkInboundTrace}. Same idea as `WithPublicEndpoint` in the Go SDK.
 * https://opentelemetry.io/docs/specs/otel/trace/api/#specifying-parent-span
 */
export const publicEndpointPropagator = (): TextMapPropagator => {
    const traceContext = new core.W3CTraceContextPropagator();
    return {
        inject: (context, carrier, setter) => {
            traceContext.inject(context, carrier, setter);
        },
        // The context comes back as it arrived: no remote parent, so the HTTP span is a root.
        extract: (context) => context,
        fields: () => traceContext.fields()
    };
};

/**
 * The propagator behind a trusted ingress (`NODE_TRUSTED_INGRESS`): the standard pair, so the
 * caller's trace continues here.
 */
const trustedIngressPropagator = (): TextMapPropagator =>
    new core.CompositePropagator({
        propagators: [new core.W3CTraceContextPropagator(), new core.W3CBaggagePropagator()]
    });

/**
 * Link an incoming span to the trace the caller named, when it sent a valid `traceparent`.
 *
 * A link keeps the correlation (a browser span and the request it caused are findable from each
 * other) without handing the caller control over this trace.
 *
 * @param span - the span the instrumentation just started
 * @param request - the incoming request; outgoing ones are left alone
 */
export const linkInboundTrace = (span: Span, request: ClientRequest | IncomingMessage): void => {
    if (!(request instanceof IncomingMessage)) return;
    // Parsed by the SDK's own W3C propagator against an empty context, so the result is only
    // what the header says — never mixed into the active context.
    const remote = trace.getSpanContext(
        new core.W3CTraceContextPropagator().extract(
            ROOT_CONTEXT,
            request.headers,
            defaultTextMapGetter
        )
    );
    if (remote && trace.isSpanContextValid(remote)) span.addLink({ context: remote });
};

/**
 * The hook run on every incoming request span: redact URL secrets, then link the caller's trace
 * unless an ingress already vouches for it (then it is the parent, not a link).
 *
 * @param span - the span the instrumentation just started
 * @param request - the incoming request; outgoing ones are left alone
 */
const onIncomingRequest = (span: Span, request: ClientRequest | IncomingMessage): void => {
    redactIncomingUrl(span, request);
    if (!tracingConfig().NODE_TRUSTED_INGRESS) linkInboundTrace(span, request);
};

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
 * The exporter reads everything else from the standard variables itself — the endpoint (with
 * `/v1/traces` appended), `OTEL_EXPORTER_OTLP_HEADERS` (split and percent-decoded per the spec,
 * so a padded base64 value survives) and their `_TRACES_` overrides.
 * https://opentelemetry.io/docs/specs/otel/protocol/exporter/
 *
 * Without an endpoint, a processor that drops every span. Still a processor, not none: with an
 * empty list the SDK registers no tracer provider at all, spans stay no-ops, and logs and audit
 * rows lose the trace id they correlate by.
 *
 * Exported so a test can construct the real processor without going through `startTracing()`,
 * which monkey-patches global modules and is not safe to call inside a shared Jest worker.
 */
export const buildProcessors = (): SpanProcessor[] => {
    const endpoint =
        tracingConfig().OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
        tracingConfig().OTEL_EXPORTER_OTLP_ENDPOINT;
    // No endpoint configured: spans are created but go nowhere, instead of failing to export.
    if (!endpoint) return [new NoopSpanProcessor()];

    // `@opentelemetry/sdk-trace`'s `BatchSpanProcessor` takes one options object (`{ exporter,
    // ... }`), unlike the deprecated `sdk-trace-base` two-argument form this replaced.
    return [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })];
};

/** Start the OpenTelemetry SDK. Safe to call multiple times. */
export const startTracing = (): void => {
    if (started) return;
    started = true;

    // Identity stamped on every span. Without a service name most backends bucket the
    // traces under "unknown_service", making them impossible to tell apart from other apps.
    const resource = resourceFromAttributes({
        // `service.name` — primary grouping key in every tracing UI.
        [ATTR_SERVICE_NAME]: loggingConfig().NODE_SERVICE_NAME,
        // `service.version` — npm injects `npm_package_version` when started via an npm script,
        // which lets you correlate a latency/error regression with a specific release.
        [ATTR_SERVICE_VERSION]: tracingConfig().npm_package_version
    });

    // Instantiate the SDK. Nothing is patched or exported yet — that happens in `start()` below.
    sdk = new NodeSDK({
        // Attributes merged into every span produced by this process (see `resource` above).
        resource,
        // Who may name our trace — see `publicEndpointPropagator`. `textMapPropagator` replaces the
        // SDK default (W3C trace context + baggage).
        textMapPropagator: tracingConfig().NODE_TRUSTED_INGRESS
            ? trustedIngressPropagator()
            : publicEndpointPropagator(),
        // Export pipeline — see `buildProcessors` for the no-endpoint case.
        spanProcessors: buildProcessors(),
        // Libraries to auto-instrument. Order is irrelevant; each patches a different module.
        instrumentations: [
            // Inbound/outbound HTTP: creates the root SERVER span per request and
            // injects the W3C `traceparent` header on outgoing calls.
            // `requestHook` rewrites the URL attributes of an incoming span whose query carries
            // a secret — see `redactUrlSecrets` — and links the caller's trace (`onIncomingRequest`).
            // (`redactedQueryParams` covers outgoing requests only.)
            // https://www.npmjs.com/package/@opentelemetry/instrumentation-http
            new HttpInstrumentation({ requestHook: onIncomingRequest }),
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
 * `BatchSpanProcessor` holds spans in memory between flushes, so skipping this on exit loses
 * the last few seconds of telemetry — exactly the spans covering a crash. Called last in the
 * shutdown chain so infra teardown is itself still traced.
 */
export const shutdownTracing = (): Promise<void> => {
    if (!sdk) return Promise.resolve();
    return sdk.shutdown();
};
