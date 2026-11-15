/**
 * @module
 * OpenTelemetry SDK bootstrap.
 *
 * This module must be imported *before* any instrumented library (express, mongoose, redis)
 * actually handles traffic: the instrumentation packages patch those modules at `sdk.start()`
 * time, so anything already running keeps the un-patched code path and produces no spans.
 *
 * See: docs/operate/opentelemetry.md
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
    type ReadableSpan,
    type SpanProcessor
} from '@opentelemetry/sdk-trace';
// `OTLPTraceExporter` speaks OTLP over HTTP/protobuf — the vendor-neutral wire format
// understood by Jaeger, Tempo, Honeycomb, Datadog, the OTel Collector, etc.
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
// Relative: this file loads first, before anything that resolves path aliases is wired.
import { isRelaxedEnvironment, loggingConfig, tracingConfig } from './config';
import { correlationDigest } from '../security/pseudonymise';
import { maskMessage } from '../adapters/log-scrub';
import { scrubbingExporter } from './span-scrub';
import packageJson from '../../../package.json';
// Auto-instrumentations: each one monkey-patches its target library so spans are created
// without touching business code. Only the four libraries this app actually uses are loaded,
// which keeps startup cost lower than the `@opentelemetry/auto-instrumentations-node` bundle.
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IncomingMessage, type ClientRequest } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
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
import { loadSharedRules } from '../config/shared-rules/load';
import { logRedactionSchema } from '../config/shared-rules/log-redaction';

/**
 * The marker the logger writes for a removed value, the same string on a span: one marker to
 * search for, whichever signal it shows up in.
 */
const REDACTED = '[REDACTED]';

/**
 * Query parameters no span may carry in clear: the OAuth callback's one-time `code` and its CSRF
 * `state`, and the `email` of a staff search, which the HTTP instrumentation otherwise records in
 * the span's URL attributes.
 * The list is `shared/rules/log-redaction.yaml`'s `traceUrlSecrets`.
 */
const QUERY_SECRETS = new Set(loadSharedRules('log-redaction', logRedactionSchema).traceUrlSecrets);

/**
 * The marker a URL attribute carries for a hidden value: `REDACTED` without brackets, the one
 * the OTel `url.query` spec (and `instrumentation-http`'s own `sig=REDACTED`) uses; a bracket
 * would be percent-encoded in a query anyway. Every other attribute and every log keeps
 * {@link REDACTED}.
 */
const URL_REDACTED = 'REDACTED';

/**
 * What stands in for a caller's address on a span, by `NODE_LOG_PERSONAL_FIELDS`, the one policy a
 * log line's `ip` follows:
 * - `hash`   the digest the log shows, so a trace and its logs still correlate.
 * - `redact` the `[REDACTED]` marker: the operator asked for removal, not a pseudonym.
 * - `plain`  the address itself (local dev).
 *
 * @param address - an email or IP address, lowercased
 */
const standIn = (address: string): string => {
    const mode = loggingConfig().NODE_LOG_PERSONAL_FIELDS;
    if (mode === 'plain') return address;
    return mode === 'redact' ? REDACTED : correlationDigest(address);
};

/**
 * One raw `name=value` pair of a query string, with a secret's value replaced by the marker and
 * an email or IP address in any other value replaced by its stand-in. The name is kept as sent.
 *
 * @param pair - the pair as it appears in the request target, still percent-encoded
 */
const redactQueryPair = (pair: string): string => {
    // Decoded the way the app reads it, so `ada%40example.com` is seen as the email it is.
    const [[name = '', value = ''] = []] = new URLSearchParams(pair);
    const rawName = pair.split('=', 1)[0] ?? '';
    if (QUERY_SECRETS.has(name)) return `${rawName}=${URL_REDACTED}`;
    const masked = maskMessage(value, (address) =>
        loggingConfig().NODE_LOG_PERSONAL_FIELDS === 'redact' ? URL_REDACTED : standIn(address)
    );
    return masked === value ? pair : `${rawName}=${masked}`;
};

/**
 * `target` (a path plus query) with the value of every {@link QUERY_SECRETS} parameter replaced by
 * `REDACTED` and every email or IP address in any other value replaced by its stand-in (a
 * staff search by `text=ada@example.com` carries one under a parameter nobody listed).
 * Returned as-is when nothing changed.
 *
 * @param target - the request target, e.g. `/account/oauth/google/callback?code=…&state=…`
 */
export const redactUrlSecrets = (target: string): string => {
    const split = target.indexOf('?');
    if (split === -1) return target;
    const query = target
        .slice(split + 1)
        .split('&')
        .map((pair) => redactQueryPair(pair))
        .join('&');
    return `${target.slice(0, split + 1)}${query}`;
};

/**
 * Overwrite an incoming span's `url.query` when the request's query carries a secret or an
 * address. `instrumentation-http` records the server span's `url.path` and `url.query` only (no
 * `http.target` or `http.url`), so that is the one attribute to rewrite.
 *
 * @param span - the span the instrumentation just started
 * @param request - the incoming request; outgoing ones are left alone
 */
const redactIncomingUrl = (span: Span, request: ClientRequest | IncomingMessage): void => {
    if (!(request instanceof IncomingMessage) || !request.url) return;
    const target = redactUrlSecrets(request.url);
    if (target === request.url) return;
    span.setAttribute('url.query', target.slice(target.indexOf('?') + 1));
};

/**
 * What a Redis span records as its statement: the command name, never the arguments. They are
 * keys and values, and a rate-limit bucket's key carries a caller's address.
 *
 * @param commandName - the Redis command, e.g. `INCR`
 */
export const redisCommandOnly = (commandName: string): string => commandName;

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

/** The span attributes that hold a caller's IP address: the client's, and the connecting peer's. */
const ADDRESS_ATTRIBUTES = ['client.address', 'network.peer.address'];

/**
 * Apply {@link standIn} to the caller's IP address on an incoming span.
 *
 * The attribute is read back off the span rather than recomputed: the instrumentation derives
 * `client.address` from `Forwarded` / `X-Forwarded-For` / the socket, and a copy of that logic
 * would drift. That derived value trusts the caller's header, so {@link stampClientAddress} later
 * replaces `client.address` with the one Express resolves.
 *
 * @param span - the span the instrumentation just started
 */
const pseudonymiseAddresses = (span: Span): void => {
    if (loggingConfig().NODE_LOG_PERSONAL_FIELDS === 'plain') return;
    // A single narrowing cast: the `Span` interface cannot be read, the SDK's class behind it can.
    const { attributes = {} } = span as Partial<ReadableSpan>;
    for (const name of ADDRESS_ATTRIBUTES) {
        const address = attributes[name];
        if (typeof address === 'string') span.setAttribute(name, standIn(address));
    }
};

/**
 * The server span of each request in flight, by request. Weak, so a request that ends takes its
 * entry with it.
 */
const serverSpans = new WeakMap<IncomingMessage, Span>();

/**
 * Middleware, mounted after `trust proxy`: set the server span's `client.address` from
 * `request.ip`, the address Express resolves by counting the configured proxy hops back from the
 * socket. The instrumentation's own value comes from the leftmost `X-Forwarded-For` entry, which
 * the caller writes, so a span would otherwise name whatever address the caller claimed.
 *
 * @param request - the request; `request.ip` follows the app's `trust proxy`
 * @param _response - unused
 * @param next - continues the chain
 */
export const stampClientAddress = (
    request: Request,
    _response: Response,
    next: NextFunction
): void => {
    const span = serverSpans.get(request);
    if (span && request.ip && loggingConfig().NODE_LOG_PERSONAL_FIELDS !== 'plain')
        span.setAttribute('client.address', standIn(request.ip));
    next();
};

/**
 * The hook run on every incoming request span: pseudonymise the caller's address, redact URL
 * secrets, then link the caller's trace unless an ingress already vouches for it (then it is the
 * parent, not a link).
 *
 * @param span - the span the instrumentation just started
 * @param request - the incoming request; outgoing ones are left alone
 */
export const onIncomingRequest = (span: Span, request: ClientRequest | IncomingMessage): void => {
    if (request instanceof IncomingMessage) {
        pseudonymiseAddresses(span);
        serverSpans.set(request, span);
    }
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
    const exporter = new OTLPTraceExporter();
    // Outside development and test the exporter keeps an error's type and drops its text.
    return [
        new BatchSpanProcessor({
            exporter: isRelaxedEnvironment() ? exporter : scrubbingExporter(exporter)
        })
    ];
};

/**
 * The version stamped on every span as `service.version`, read from `package.json`.
 * Not `npm_package_version`: the production image has no npm, so the process is not started by one.
 */
export const SERVICE_VERSION: string = packageJson.version;

/** Start the OpenTelemetry SDK. Safe to call multiple times. */
export const startTracing = (): void => {
    if (started) return;
    started = true;

    // Identity stamped on every span. Without a service name most backends bucket the
    // traces under "unknown_service", making them impossible to tell apart from other apps.
    const resource = resourceFromAttributes({
        // `service.name` — primary grouping key in every tracing UI.
        [ATTR_SERVICE_NAME]: loggingConfig().NODE_SERVICE_NAME,
        // `service.version` — lets you correlate a latency/error regression with a release.
        [ATTR_SERVICE_VERSION]: SERVICE_VERSION
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
            // a secret or an address — see `redactUrlSecrets` — and links the caller's trace
            // (`onIncomingRequest`).
            // https://www.npmjs.com/package/@opentelemetry/instrumentation-http
            new HttpInstrumentation({ requestHook: onIncomingRequest }),
            // Express: adds child spans per middleware and per route handler, and supplies
            // the route template (`/products/:id`) that keeps span names low-cardinality.
            new ExpressInstrumentation(),
            // Mongoose: one span per query with collection, operation and (optionally) filter.
            new MongooseInstrumentation(),
            // Redis: one span per command — makes cache hit/miss latency visible in the trace.
            // `dbStatementSerializer` decides what `db.query.text` holds — see `redisCommandOnly`.
            // https://www.npmjs.com/package/@opentelemetry/instrumentation-redis
            new RedisInstrumentation({ dbStatementSerializer: redisCommandOnly })
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
