/**
 * @module
 * The span exporter that keeps an error's TYPE and drops its text, for spans another library
 * recorded (the Mongoose instrumentation puts `err.message` on the status and the exception event).
 *
 * Why here: an instrumentation's own options cannot stop it, and a Collector processor only
 * protects deployments that run ours. This is the last place before a span leaves the process.
 * @see docs/operate/opentelemetry.md
 */

import type { Attributes } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';

/** The exception event's attributes that name no data: the type, and whether it escaped the span. */
const KEPT_EXCEPTION_ATTRIBUTES = ['exception.type', 'exception.escaped'];

/**
 * The span with its exception events cut to their type and its status text replaced by the
 * error's type (`error.type`, else the first exception's type, else none).
 *
 * A proxy rather than a spread: a `ReadableSpan` is a class instance, and its methods live on the
 * prototype, which a spread drops.
 *
 * @param span - a finished span
 */
const scrubSpan = (span: ReadableSpan): ReadableSpan => {
    if (span.status.code !== SpanStatusCode.ERROR && span.events.length === 0) return span;

    const events = span.events.map((event) => {
        if (event.name !== 'exception') return event;
        const attributes: Attributes = {};
        for (const key of KEPT_EXCEPTION_ATTRIBUTES)
            if (event.attributes?.[key] !== undefined) attributes[key] = event.attributes[key];
        return { ...event, attributes };
    });
    const type =
        span.attributes['error.type'] ??
        events.find((event) => event.name === 'exception')?.attributes?.['exception.type'];
    const status = {
        code: span.status.code,
        ...(span.status.code === SpanStatusCode.ERROR && typeof type === 'string'
            ? { message: type }
            : {})
    };

    return new Proxy(span, {
        get: (target, property) => {
            if (property === 'events') return events;
            if (property === 'status') return status;
            // `Reflect.get` answers `any`; widened to `unknown` so the proxy passes it on
            // unexamined.
            return Reflect.get(target, property) as unknown;
        }
    });
};

/**
 * Wraps an exporter so every span it receives passes through {@link scrubSpan} first.
 *
 * @param inner - the exporter that actually sends the spans
 */
export const scrubbingExporter = (inner: SpanExporter): SpanExporter => ({
    export: (spans, resultCallback) => {
        inner.export(
            spans.map((span) => scrubSpan(span)),
            resultCallback
        );
    },
    shutdown: () => inner.shutdown(),
    forceFlush: () => inner.forceFlush?.() ?? Promise.resolve()
});
