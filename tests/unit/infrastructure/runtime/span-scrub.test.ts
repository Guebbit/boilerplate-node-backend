/**
 * @module
 * `scrubbingExporter`: a span another library recorded (here: a Mongo error the way the Mongoose
 * instrumentation writes it, full message on the status and on the exception event) reaches the
 * exporter with the error's type only.
 */

import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { node } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace';
import { scrubbingExporter } from '@infrastructure/runtime/span-scrub';

const LEAK = 'E11000 duplicate key error dup key: { email: "ada@example.com" }';

/** Runs `record` on a fresh span and returns what the inner exporter received for it. */
const exported = (record: (span: Span) => void) => {
    const inner = new InMemorySpanExporter();
    const provider = new node.NodeTracerProvider({
        spanProcessors: [new SimpleSpanProcessor({ exporter: scrubbingExporter(inner) })]
    });
    const span = provider.getTracer('test').startSpan('db.query');
    record(span);
    span.end();
    return inner.getFinishedSpans()[0];
};

const mongoFailure = (span: Span) => {
    const error = Object.assign(new Error(LEAK), { name: 'MongoServerError' });
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: LEAK });
};

describe('scrubbingExporter', () => {
    it('exports no message on the status or the exception event', () => {
        const span = exported(mongoFailure);

        expect(JSON.stringify([span.status, span.events])).not.toContain('ada@example.com');
    });

    it('keeps the error type, on the status and on the exception event', () => {
        const span = exported(mongoFailure);

        expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'MongoServerError' });
        expect(span.events[0]?.attributes).toEqual({ 'exception.type': 'MongoServerError' });
    });

    it('drops the stack trace of an exception event', () => {
        const span = exported(mongoFailure);

        expect(span.events[0]?.attributes).not.toHaveProperty('exception.stacktrace');
    });

    it('keeps the rest of the span readable through the copy', () => {
        const span = exported(mongoFailure);

        expect(span.name).toBe('db.query');
        expect(span.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('leaves an event that is not an exception untouched', () => {
        const span = exported((live) => {
            live.addEvent('cache.miss', { key: 'products' });
        });

        expect(span.events[0]?.attributes).toEqual({ key: 'products' });
    });

    it('passes a healthy span through as it is', () => {
        const span = exported((live) => {
            live.setStatus({ code: SpanStatusCode.OK });
        });

        expect(span.status.code).toBe(SpanStatusCode.OK);
    });
});
