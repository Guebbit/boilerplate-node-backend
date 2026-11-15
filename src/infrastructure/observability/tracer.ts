/**
 * @module
 * Tracer helper — a thin wrapper around the OpenTelemetry API. Import `getTracer()` or
 * `withSpan()` anywhere a custom span is needed.
 *
 * See: docs/operate/opentelemetry.md
 */

// `@opentelemetry/api` is the *interface* package, separate from the SDK — trace/SpanStatusCode/
// Span/Attributes. Importing it when no SDK is registered is harmless: every call becomes a
// no-op, which is what lets tests run without booting OpenTelemetry.
import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';
// js-toolkit: consults a bare string, an `Error`, then a `message` on the value itself, so a
// rejection that is not an `Error` still yields its message. `String(error)` is the fallback
// rather than the toolkit's default empty string. https://github.com/Guebbit/js-toolkit
import { extractErrorMessage } from '@guebbit/js-toolkit';
import { isRelaxedEnvironment } from '@infrastructure/runtime/config';

/**
 * Single tracer scoped to this service.
 * The tracer name identifies the *instrumentation source* and shows up on every span, letting
 * you tell hand-written spans apart from those the auto-instrumentations produced.
 */
const TRACER_NAME = 'boilerplate-node-backend';

/**
 * Return the active OTel tracer. `trace.getTracer()` is cheap and cached by the global provider,
 * so there's no reason to hold it in a module constant — and calling it lazily avoids grabbing a
 * no-op tracer at import time, before `startTracing()` registers the real provider.
 */
export const getTracer = () => trace.getTracer(TRACER_NAME);

/**
 * Run an async function inside a named OTel span: opens a child span under the active context,
 * records any thrown error on it, and ends it whether the call succeeds or fails.
 */
export const withSpan = <T>(spanName: string, callback: (span: Span) => Promise<T>): Promise<T> => {
    const tracer = getTracer();
    // startActiveSpan (vs startSpan) makes the span *current* for the callback's duration, so
    // anything called inside — a Mongoose query, `getActiveSpanContext()` — attaches as a child
    // automatically, with no span threaded through the call stack.
    return tracer.startActiveSpan(spanName, (span) => {
        // Attributes are the callback's to set, through its `span` argument, once it has computed
        // values worth recording.
        // Two-callback `.then(onFulfilled, onRejected)` rather than `.then().catch()`: it keeps
        // the success and failure paths mutually exclusive, so a throw inside the success
        // handler could not end the span twice.
        // Started inside a promise, so a callback that throws synchronously still reaches the
        // failure branch below — and its span still ends.
        return Promise.resolve()
            .then(() => callback(span))
            .then(
                (result) => {
                    span.setStatus({ code: SpanStatusCode.OK });
                    // `end()` stamps the duration. A span that is never ended is never exported —
                    // the single most common way to lose telemetry.
                    span.end();
                    return result;
                },
                (error: unknown) => {
                    // Marks the span red / counted toward error rates, then ends it.
                    markSpanFailed(span, error);
                    span.end();
                    // Re-throw: this wrapper observes, it never swallows. Callers keep their
                    // existing error handling unchanged.
                    throw error;
                }
            );
    });
};

/**
 * Mark a span as failed: error status, `error.type`, and an exception event for an `Error`.
 *
 * Outside development and test the status message is the error's `name` only: a message can
 * carry request data (a duplicate-key error names the email) and a trace backend keeps it.
 * The exception event is cut the same way, and `recordException(error)` would also write
 * `exception.stacktrace` (absolute paths, dependency internals), so only `{ name }` is recorded.
 * The exporter (`src/infrastructure/runtime/span-scrub.ts`) applies the same rule to spans other libraries recorded.
 *
 * @param span - the span to annotate
 * @param error - what was thrown
 */
const markSpanFailed = (span: Span, error: unknown): void => {
    const relaxed = isRelaxedEnvironment();
    const type = error instanceof Error ? error.name : typeof error;
    span.setAttribute('error.type', type);
    span.setStatus({
        code: SpanStatusCode.ERROR,
        message: relaxed ? extractErrorMessage(error, String(error)) : type
    });
    // https://opentelemetry.io/docs/specs/semconv/exceptions/exceptions-spans/
    if (error instanceof Error) span.recordException(relaxed ? error : { name: error.name });
};

/**
 * Record an error on the currently active span without throwing.
 * Useful in error handlers that want to annotate the span but handle the error separately.
 */
export const recordErrorOnActiveSpan = (error: unknown): void => {
    const span = trace.getActiveSpan();
    // No active span (untraced context) — nothing to annotate, and not an error condition.
    if (!span) return;
    markSpanFailed(span, error);
    // Note: deliberately does NOT call `span.end()`. The span belongs to whoever opened it
    // (usually the auto-instrumentation's request span) and ending it here would truncate it.
};
