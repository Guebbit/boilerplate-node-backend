import { trace, context, SpanStatusCode, SpanKind } from "@opentelemetry/api";
import type { Span, SpanOptions } from "@opentelemetry/api";

/** Returns the tracer for the given instrumentation scope name. */
export function getTracer(name: string) {
  return trace.getTracer(name);
}

/**
 * Wraps a callback in a named span.
 * The span status is set to ERROR automatically if the callback throws.
 */
export async function withSpan<T>(
  tracerName: string,
  spanName: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const tracer = getTracer(tracerName);
  return tracer.startActiveSpan(
    spanName,
    { kind: SpanKind.INTERNAL, ...options },
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    }
  );
}

/** Returns the active span context (traceId, spanId) for correlation. */
export function getActiveSpanContext(): {
  traceId: string | undefined;
  spanId: string | undefined;
} {
  const span = trace.getActiveSpan();
  if (!span) return { traceId: undefined, spanId: undefined };
  const ctx = span.spanContext();
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

/** Extracts the active context — useful for propagating to child tasks. */
export function getActiveContext() {
  return context.active();
}
