/**
 * @module
 * `otel-sdk.ts`'s `buildProcessors()` — not the whole SDK bootstrap: `startTracing()`
 * monkey-patches express/mongoose/redis/http globally and is not safe to call inside a Jest
 * worker shared with other test files.
 *
 * `@opentelemetry/sdk-trace`'s `BatchSpanProcessor` takes one options object (`{ exporter, ... }`)
 * — a real, silent-until-flush break from the deprecated `sdk-trace-base` two-argument form
 * `@opentelemetry/sdk-trace-node` re-exported: passing the exporter positionally leaves
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
    trace,
    type Span
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { asStub } from '@tests/stub';
import { withEnvironment } from '@tests/environment';
import { NoopSpanProcessor } from '@opentelemetry/sdk-trace';
import {
    buildProcessors,
    linkInboundTrace,
    publicEndpointPropagator,
    redactUrlSecrets
} from '@infrastructure/runtime/otel-sdk';

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
        // Never set by any test's own environment — this is the suite's ambient default, not a
        // fixture this case has to arrange. A processor, not none: with none the SDK registers
        // no tracer provider, and logs lose their trace ids.
        expect(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
        const processors = buildProcessors();

        expect(processors).toHaveLength(1);
        expect(processors[0]).toBeInstanceOf(NoopSpanProcessor);
    });

    it('exports when only the traces-specific endpoint is set', async () => {
        await withEnvironment(
            'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
            'http://localhost:4318/v1/traces',
            () => {
                expect(buildProcessors()[0]).not.toBeInstanceOf(NoopSpanProcessor);
                return Promise.resolve();
            }
        );
    });

    it('forwards a finished span to a real exporter at flush time', async () => {
        // Spied on the class, not an instance: `buildProcessors()` constructs its own
        // `OTLPTraceExporter` internally, so there is no instance to spy on beforehand.
        const exportSpy = jest
            .spyOn(OTLPTraceExporter.prototype, 'export')
            .mockImplementation((_spans, callback) => callback({ code: 0 }));

        await withEnvironment('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318', async () => {
            const [processor] = buildProcessors();
            processor.onEnd(sampledSpanStub());
            await processor.forceFlush();
        });

        expect(exportSpy).toHaveBeenCalledTimes(1);
        exportSpy.mockRestore();
    });
});

describe('otel-sdk — redactUrlSecrets', () => {
    it("hides the OAuth callback's code and state", () => {
        expect(redactUrlSecrets('/account/oauth/google/callback?code=abc&state=xyz&x=1')).toBe(
            '/account/oauth/google/callback?code=REDACTED&state=REDACTED&x=1'
        );
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
        const provider = new NodeTracerProvider();
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
        const provider = new NodeTracerProvider();
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
