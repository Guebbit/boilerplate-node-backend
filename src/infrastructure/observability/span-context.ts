/**
 * @module
 * The active span's identity, for anything that stamps a trace id onto what it writes.
 *
 * Relative imports and no dependency but the OTel API: `adapters/logger.ts` imports this, and it
 * sits on jest `globalSetup`'s own import chain.
 */

import { trace } from '@opentelemetry/api';

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
    /**
     * Reads from OTel's async context (AsyncLocalStorage), so it works anywhere in a traced
     * request without threading a span through every signature — the glue for cross-signal
     * correlation: every log line, audit row and analytics event stamps the same traceId.
     */
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
