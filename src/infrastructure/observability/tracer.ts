/**
 * @module
 * Tracer helper — a thin wrapper around the OpenTelemetry API. Import `getTracer()` or
 * `withSpan()` anywhere a custom span is needed.
 *
 * See: docs/tools/opentelemetry.md
 */

// `@opentelemetry/api` is the *interface* package, separate from the SDK — trace/SpanStatusCode/
// Span/Attributes. Importing it when no SDK is registered is harmless: every call becomes a
// no-op, which is what lets tests run without booting OpenTelemetry.
import { trace, SpanStatusCode, type Span, type Attributes } from '@opentelemetry/api';

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
export const withSpan = <T>(
    spanName: string,
    callback: (span: Span) => Promise<T>,
    attributes?: Attributes
): Promise<T> => {
    const tracer = getTracer();
    // startActiveSpan (vs startSpan) makes the span *current* for the callback's duration, so
    // anything called inside — a Mongoose query, `getActiveSpanContext()` — attaches as a child
    // automatically, with no span threaded through the call stack.
    return tracer.startActiveSpan(spanName, (span) => {
        // Attributes known up front. The callback can add more via its `span` argument once it
        // has computed values worth recording.
        if (attributes) span.setAttributes(attributes);

        // Two-callback `.then(onFulfilled, onRejected)` rather than `.then().catch()`: it keeps
        // the success and failure paths mutually exclusive, so a throw inside the success
        // handler could not end the span twice.
        return callback(span).then(
            (result) => {
                span.setStatus({ code: SpanStatusCode.OK });
                // `end()` stamps the duration. A span that is never ended is never exported —
                // the single most common way to lose telemetry.
                span.end();
                return result;
            },
            (error: unknown) => {
                // `setStatus(ERROR)` records the failure before propagating — this is what
                // makes the span show up red / count toward error rates in the backend.
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : String(error)
                });
                // `recordException` additionally attaches a structured exception *event*
                // (type, message, stack) — richer than the status message alone.
                if (error instanceof Error) span.recordException(error);
                span.end();
                // Re-throw: this wrapper observes, it never swallows. Callers keep their
                // existing error handling unchanged.
                throw error;
            }
        );
    });
};

/**
 * OTel uses all-zeros trace/span IDs for no-op/invalid spans — treat these as absent. Without
 * this check, log lines in an untraced context (tests, before the SDK starts) would carry a
 * meaningless all-zeros id that looks like real data.
 */
const isValidOtelId = (id: string) => Boolean(id) && !/^0+$/.test(id);

/**
 * Return the trace ID and span ID from the currently active OTel span, if any.
 * Returns undefined fields when no span is active (e.g. in tests without SDK).
 */
export const getActiveSpanContext = (): {
    traceId: string | undefined;
    spanId: string | undefined;
} => {
    // Reads from OTel's async context (AsyncLocalStorage), so it works anywhere in a traced
    // request without threading a span through every signature — the glue for cross-signal
    // correlation, since audit/analytics events stamp the same traceId.
    const activeSpan = trace.getActiveSpan();
    if (!activeSpan) return { traceId: undefined, spanId: undefined };
    // `spanContext()` returns the wire-propagatable identity: traceId, spanId, trace flags.
    const spanContext = activeSpan.spanContext();
    return {
        // `traceId` — the whole request across services. `spanId` — this one operation.
        traceId: isValidOtelId(spanContext.traceId) ? spanContext.traceId : undefined,
        spanId: isValidOtelId(spanContext.spanId) ? spanContext.spanId : undefined
    };
};

/**
 * Record an error on the currently active span without throwing.
 * Useful in error handlers that want to annotate the span but handle the error separately.
 */
export const recordErrorOnActiveSpan = (error: unknown): void => {
    const span = trace.getActiveSpan();
    // No active span (untraced context) — nothing to annotate, and not an error condition.
    if (!span) return;
    span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
    });
    if (error instanceof Error) span.recordException(error);
    // Note: deliberately does NOT call `span.end()`. The span belongs to whoever opened it
    // (usually the auto-instrumentation's request span) and ending it here would truncate it.
};
