/**
 * Tracer helper — Phase 3
 *
 * Thin wrapper around the OpenTelemetry API.
 * Import getTracer() or withSpan() anywhere you want to create a custom span.
 *
 * See: docs/guide/opentelemetry-tracing.md
 */

import { trace, context, SpanStatusCode, type Span, type Attributes } from '@opentelemetry/api';

// Single tracer scoped to this service.
const TRACER_NAME = 'boilerplate-node-backend';

/** Return the active OTel tracer. */
export const getTracer = () => trace.getTracer(TRACER_NAME);

/**
 * Run an async function inside a named OTel span.
 *
 * - Opens a new child span under the active context.
 * - Records any thrown error on the span and re-throws.
 * - Ends the span whether the call succeeds or fails.
 *
 * @example
 * const result = await withSpan('users.login', async (span) => {
 *   span.setAttribute('user.email', email);
 *   return await userService.login(email, password);
 * });
 */
export const withSpan = <T>(
    spanName: string,
    callback: (span: Span) => Promise<T>,
    attributes?: Attributes
): Promise<T> => {
    const tracer = getTracer();
    return tracer.startActiveSpan(spanName, (span) => {
        if (attributes) span.setAttributes(attributes);

        return callback(span).then(
            (result) => {
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
                return result;
            },
            (error: unknown) => {
                // Record the error on the span before propagating.
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : String(error)
                });
                if (error instanceof Error) span.recordException(error);
                span.end();
                throw error;
            }
        );
    });
};

/** OTel uses all-zeros trace/span IDs for no-op/invalid spans — treat these as absent. */
const isValidOtelId = (id: string) => Boolean(id) && !/^0+$/.test(id);

/**
 * Return the trace ID and span ID from the currently active OTel span, if any.
 * Returns undefined fields when no span is active (e.g. in tests without SDK).
 */
export const getActiveSpanContext = (): {
    traceId: string | undefined;
    spanId: string | undefined;
} => {
    const activeSpan = trace.getActiveSpan();
    if (!activeSpan) return { traceId: undefined, spanId: undefined };
    const spanContext = activeSpan.spanContext();
    return {
        traceId: isValidOtelId(spanContext.traceId) ? spanContext.traceId : undefined,
        spanId: isValidOtelId(spanContext.spanId) ? spanContext.spanId : undefined
    };
};

/**
 * Attach extra attributes to the currently active span, if any.
 * Safe to call when no span is active — simply does nothing.
 */
export const setActiveSpanAttributes = (attributes: Attributes): void => {
    trace.getActiveSpan()?.setAttributes(attributes);
};

/**
 * Record an error on the currently active span without throwing.
 * Useful in error handlers that want to annotate the span but handle the error separately.
 */
export const recordErrorOnActiveSpan = (error: unknown): void => {
    const span = trace.getActiveSpan();
    if (!span) return;
    span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
    });
    if (error instanceof Error) span.recordException(error);
};

// Re-export OTel primitives for callers that need them without importing @opentelemetry/api directly.
export { SpanStatusCode } from '@opentelemetry/api';
export { trace } from '@opentelemetry/api';
export { context } from '@opentelemetry/api';
