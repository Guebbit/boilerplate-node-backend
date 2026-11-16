/**
 * @module
 * `otel-sdk.ts`'s `buildProcessors()` — not the whole SDK bootstrap: `startTracing()`
 * monkey-patches express/mongoose/redis/http globally and is not safe to call inside a Jest
 * worker shared with other test files.
 *
 * `@opentelemetry/sdk-trace`'s `BatchSpanProcessor` takes one options object (`{ exporter, ... }`):
 * passing the exporter positionally leaves
 * `options.exporter` `undefined`, so a span queues fine and the failure only surfaces later,
 * inside `_flushAll()`, when it tries `undefined.export(...)`. `ts-check` catches the shape going
 * forward; this pins that a span really does reach a real exporter's `export()` at runtime too.
 */

import { IncomingMessage, type ClientRequest } from 'node:http';
import { Socket } from 'node:net';
import {
    ROOT_CONTEXT,
    TraceFlags,
    context,
    defaultTextMapGetter,
    defaultTextMapSetter,
    propagation,
    SpanStatusCode,
    trace,
    type Span
} from '@opentelemetry/api';
import { TracerProvider, type ReadableSpan } from '@opentelemetry/sdk-trace';
import { ExportResultCode } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { asStub } from '@tests/stub';
import { withEnvironmentOverrides } from '@tests/environment';
import { NoopSpanProcessor } from '@opentelemetry/sdk-trace';
import { correlationDigest } from '@infrastructure/security/pseudonymise';
import packageJson from '../../../../package.json';
import {
    SERVICE_VERSION,
    buildProcessors,
    linkInboundTrace,
    publicEndpointPropagator,
    onIncomingRequest,
    redactUrlSecrets,
    redisCommandOnly
} from '@infrastructure/runtime/otel-sdk';

/**
 * The real exporter, wrapped so the options `buildProcessors()` gives it can be read back: the
 * class's own module property cannot be spied on, and those options are where the headers show
 * before any network call. It keeps the real prototype, so the `prototype.export` spies below
 * still land on what the processors use.
 */
jest.mock('@opentelemetry/exporter-trace-otlp-http', () => {
    const actual = jest.requireActual<typeof import('@opentelemetry/exporter-trace-otlp-http')>(
        '@opentelemetry/exporter-trace-otlp-http'
    );
    const construct = jest.fn(
        (options?: ConstructorParameters<typeof actual.OTLPTraceExporter>[0]) =>
            new actual.OTLPTraceExporter(options)
    );
    construct.prototype = actual.OTLPTraceExporter.prototype;
    return { ...actual, OTLPTraceExporter: construct };
});

/**
 * Enough of a `ReadableSpan` to survive `onEnd`'s sampled check and `_flushOneBatch`'s resource
 * read — nothing else is read before the mocked `export()` swallows it.
 */
const sampledSpanStub = (): ReadableSpan =>
    asStub<ReadableSpan>({
        spanContext: () => ({ traceFlags: TraceFlags.SAMPLED }),
        resource: { asyncAttributesPending: false }
    });

describe('otel-sdk — buildProcessors', () => {
    it('drops every span without an endpoint, but still registers a processor', () => {
        /**
         * Never set by any test's own environment — this is the suite's ambient default, not a
         * fixture this case has to arrange. A processor, not none: with none the SDK registers
         * no tracer provider, and logs lose their trace ids.
         */
        expect(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
        const processors = buildProcessors();

        expect(processors).toHaveLength(1);
        expect(processors[0]).toBeInstanceOf(NoopSpanProcessor);
    });

    it('exports when only the traces-specific endpoint is set', async () => {
        await withEnvironmentOverrides(
            { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces' },
            () => {
                expect(buildProcessors()[0]).not.toBeInstanceOf(NoopSpanProcessor);
                return Promise.resolve();
            }
        );
    });

    it('forwards a finished span to a real exporter at flush time', async () => {
        /**
         * Spied on the class, not an instance: `buildProcessors()` constructs its own
         * `OTLPTraceExporter` internally, so there is no instance to spy on beforehand.
         */
        const exportSpy = jest
            .spyOn(OTLPTraceExporter.prototype, 'export')
            .mockImplementation((_spans, callback) => callback({ code: ExportResultCode.SUCCESS }));

        await withEnvironmentOverrides(
            { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318' },
            async () => {
                const [processor] = buildProcessors();
                processor.onEnd(sampledSpanStub());
                await processor.forceFlush();
            }
        );

        expect(exportSpy).toHaveBeenCalledTimes(1);
        exportSpy.mockRestore();
    });

    it('hands the headers of NODE_OTEL_EXPORTER_OTLP_HEADERS to the exporter', async () => {
        jest.mocked(OTLPTraceExporter).mockClear();

        await withEnvironmentOverrides(
            {
                OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
                NODE_OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer%20token,X-Tenant=acme'
            },
            () => {
                buildProcessors();
                return Promise.resolve();
            }
        );

        const [options] = jest.mocked(OTLPTraceExporter).mock.calls[0] ?? [];
        expect(options).toEqual({ headers: { Authorization: 'Bearer token', 'X-Tenant': 'acme' } });
    });

    it('leaves the exporter to read OTEL_EXPORTER_OTLP_HEADERS itself when no secret is set', async () => {
        jest.mocked(OTLPTraceExporter).mockClear();

        await withEnvironmentOverrides(
            { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318' },
            () => {
                buildProcessors();
                return Promise.resolve();
            }
        );

        expect(jest.mocked(OTLPTraceExporter)).toHaveBeenCalledTimes(1);
        const [options] = jest.mocked(OTLPTraceExporter).mock.calls[0] ?? [];
        expect(options).toBeUndefined();
    });
});

/** A sampled span that failed with a message quoting an address. */
const failedSpan = (): ReadableSpan =>
    asStub<ReadableSpan>({
        spanContext: () => ({ traceFlags: TraceFlags.SAMPLED }),
        resource: { asyncAttributesPending: false },
        attributes: { 'error.type': 'MongoServerError' },
        events: [],
        status: { code: SpanStatusCode.ERROR, message: 'dup key ada@example.com' }
    });

/** The status the exporter was handed for a failed span, under this NODE_ENV. */
const exportedStatus = async (nodeEnvironment: string) => {
    const exportSpy = jest
        .spyOn(OTLPTraceExporter.prototype, 'export')
        .mockImplementation((_spans, callback) => callback({ code: ExportResultCode.SUCCESS }));
    await withEnvironmentOverrides(
        { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318', NODE_ENV: nodeEnvironment },
        async () => {
            const [processor] = buildProcessors();
            processor.onEnd(failedSpan());
            await processor.forceFlush();
        }
    );
    const [exportedSpans] = exportSpy.mock.calls[0] ?? [[]];
    exportSpy.mockRestore();
    return exportedSpans[0]?.status;
};

describe('otel-sdk — buildProcessors, error text', () => {
    it('exports the error type, not its message, in production', async () => {
        expect(await exportedStatus('production')).toEqual({
            code: SpanStatusCode.ERROR,
            message: 'MongoServerError'
        });
    });

    it('exports the message in development', async () => {
        expect(await exportedStatus('development')).toMatchObject({
            message: 'dup key ada@example.com'
        });
    });
});

describe('otel-sdk — redactUrlSecrets', () => {
    it("hides the OAuth callback's code and state", () => {
        expect(redactUrlSecrets('/account/oauth/google/callback?code=abc&state=xyz&x=1')).toBe(
            '/account/oauth/google/callback?code=REDACTED&state=REDACTED&x=1'
        );
    });

    it("hides a staff search's email, however it is encoded", () => {
        expect(redactUrlSecrets('/users?email=ada%40example.com')).toBe('/users?email=REDACTED');
    });

    it('leaves a URL with nothing to hide untouched', () => {
        expect(redactUrlSecrets('/products?page=2')).toBe('/products?page=2');
    });
});

/** A valid W3C traceparent whose sampled flag is `flags` (`01` sampled, `00` not). */
const traceparent = (flags: string) =>
    `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-${flags}`;

/** An incoming request carrying exactly these headers. */
const incoming = (headers: Record<string, string>): IncomingMessage =>
    Object.assign(new IncomingMessage(new Socket()), { headers });

describe('otel-sdk — publicEndpointPropagator', () => {
    const propagator = publicEndpointPropagator();

    it('adopts no remote parent from an inbound traceparent', () => {
        const extracted = propagator.extract(
            ROOT_CONTEXT,
            { traceparent: traceparent('01') },
            defaultTextMapGetter
        );

        expect(trace.getSpanContext(extracted)).toBeUndefined();
    });

    it('drops inbound baggage', () => {
        const extracted = propagator.extract(
            ROOT_CONTEXT,
            { baggage: 'userId=evil' },
            defaultTextMapGetter
        );

        expect(propagation.getBaggage(extracted)).toBeUndefined();
    });

    it('still injects traceparent on an outgoing call', () => {
        const provider = new TracerProvider();
        const span = provider.getTracer('test').startSpan('outgoing');
        const carrier: Record<string, string> = {};

        propagator.inject(trace.setSpan(ROOT_CONTEXT, span), carrier, defaultTextMapSetter);

        expect(carrier.traceparent).toContain(span.spanContext().traceId);
    });

    it('lists traceparent as the field it writes', () => {
        expect(propagator.fields()).toEqual(['traceparent', 'tracestate']);
    });

    it('still yields a sampled root span when the caller sent an unsampled traceparent', () => {
        // The attack the propagator closes: a `-00` flag must not switch our tracing off.
        const provider = new TracerProvider();
        const extracted = propagator.extract(
            context.active(),
            { traceparent: traceparent('00') },
            defaultTextMapGetter
        );

        const span = provider.getTracer('test').startSpan('request', {}, extracted);

        expect(span.spanContext().traceFlags & TraceFlags.SAMPLED).toBe(TraceFlags.SAMPLED);
        expect(span.spanContext().traceId).not.toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    });
});

/** A span that records the links it was given. */
const recordingSpan = () => {
    const addLink = jest.fn();
    return { span: asStub<Span>({ addLink }), addLink };
};

describe('otel-sdk — linkInboundTrace', () => {
    it('links the trace a valid traceparent names', () => {
        const { span, addLink } = recordingSpan();

        linkInboundTrace(span, incoming({ traceparent: traceparent('01') }));

        expect(addLink).toHaveBeenCalledWith({
            context: expect.objectContaining({
                traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
                spanId: '00f067aa0ba902b7'
            })
        });
    });

    it('links an unsampled caller too: the link carries its flags, it does not obey them', () => {
        const { span, addLink } = recordingSpan();

        linkInboundTrace(span, incoming({ traceparent: traceparent('00') }));

        expect(addLink).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['no traceparent', {}],
        ['a malformed one', { traceparent: 'not-a-traceparent' }],
        [
            'an all-zero trace id',
            { traceparent: '00-00000000000000000000000000000000-00f067aa0ba902b7-01' }
        ]
    ])('links nothing for %s', (_label, headers) => {
        const { span, addLink } = recordingSpan();

        linkInboundTrace(span, incoming(headers));

        expect(addLink).not.toHaveBeenCalled();
    });

    it('leaves an outgoing request alone', () => {
        const { span, addLink } = recordingSpan();

        linkInboundTrace(
            span,
            asStub<ClientRequest>({ headers: { traceparent: traceparent('01') } })
        );

        expect(addLink).not.toHaveBeenCalled();
    });
});

describe('otel-sdk — SERVICE_VERSION', () => {
    it('is the version package.json declares, not an npm-injected variable', () => {
        expect(SERVICE_VERSION).toBe(packageJson.version);
        expect(SERVICE_VERSION).not.toBe('0.0.0');
    });
});

/** An incoming request and a span that already holds the instrumentation's attributes. */
const incomingWithAddresses = (url: string) => {
    const request = new IncomingMessage(new Socket());
    request.url = url;
    const setAttribute = jest.fn();
    const span = asStub<Span>({
        attributes: { 'client.address': '203.0.113.9', 'network.peer.address': '10.0.0.2' },
        setAttribute,
        setAttributes: jest.fn(),
        addLink: jest.fn()
    });
    return { request, span, setAttribute };
};

describe('otel-sdk — onIncomingRequest', () => {
    it('replaces both caller addresses with the digest a log line shows for `ip`', async () => {
        const { request, span, setAttribute } = incomingWithAddresses('/products');

        await withEnvironmentOverrides({ NODE_LOG_PERSONAL_FIELDS: 'hash' }, () => {
            onIncomingRequest(span, request);
            return Promise.resolve();
        });

        expect(setAttribute).toHaveBeenCalledWith(
            'client.address',
            correlationDigest('203.0.113.9')
        );
        expect(setAttribute).toHaveBeenCalledWith(
            'network.peer.address',
            correlationDigest('10.0.0.2')
        );
    });

    it('replaces both caller addresses with the log marker in redact mode', async () => {
        const { request, span, setAttribute } = incomingWithAddresses('/products');

        await withEnvironmentOverrides({ NODE_LOG_PERSONAL_FIELDS: 'redact' }, () => {
            onIncomingRequest(span, request);
            return Promise.resolve();
        });

        expect(setAttribute).toHaveBeenCalledWith('client.address', '[REDACTED]');
        expect(setAttribute).toHaveBeenCalledWith('network.peer.address', '[REDACTED]');
    });

    it('leaves the addresses alone in plain mode', async () => {
        const { request, span, setAttribute } = incomingWithAddresses('/products');

        await withEnvironmentOverrides({ NODE_LOG_PERSONAL_FIELDS: 'plain' }, () => {
            onIncomingRequest(span, request);
            return Promise.resolve();
        });

        expect(setAttribute).not.toHaveBeenCalled();
    });

    it('rewrites a staff search email out of url.query, and writes no old-convention attribute', () => {
        const { request, span, setAttribute } = incomingWithAddresses(
            '/users?email=ada%40example.com'
        );

        onIncomingRequest(span, request);

        expect(setAttribute).toHaveBeenCalledWith('url.query', 'email=REDACTED');
        expect(setAttribute).not.toHaveBeenCalledWith('http.target', expect.anything());
        expect(setAttribute).not.toHaveBeenCalledWith('http.url', expect.anything());
    });
});

describe('otel-sdk — an address in a query value', () => {
    it('is replaced by its digest under a parameter nobody listed', async () => {
        await withEnvironmentOverrides({ NODE_LOG_PERSONAL_FIELDS: 'hash' }, () => {
            expect(redactUrlSecrets('/users?text=Ada%40Example.com&page=2')).toBe(
                `/users?text=${correlationDigest('ada@example.com')}&page=2`
            );
            expect(redactUrlSecrets('/orders?from=203.0.113.9')).toBe(
                `/orders?from=${correlationDigest('203.0.113.9')}`
            );
            return Promise.resolve();
        });
    });

    it('is replaced by the marker in redact mode', async () => {
        await withEnvironmentOverrides({ NODE_LOG_PERSONAL_FIELDS: 'redact' }, () => {
            expect(redactUrlSecrets('/users?text=ada%40example.com')).toBe('/users?text=REDACTED');
            return Promise.resolve();
        });
    });

    it('stays in plain mode, while a listed secret is still hidden', async () => {
        await withEnvironmentOverrides({ NODE_LOG_PERSONAL_FIELDS: 'plain' }, () => {
            expect(redactUrlSecrets('/users?text=ada%40example.com&code=abc')).toBe(
                '/users?text=ada%40example.com&code=REDACTED'
            );
            return Promise.resolve();
        });
    });
});

describe('otel-sdk — redisCommandOnly', () => {
    it('keeps the command and drops the key a rate limiter built from an address', () => {
        expect(redisCommandOnly('INCR')).toBe('INCR');
    });
});
