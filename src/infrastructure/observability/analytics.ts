/**
 * Product analytics (PostHog).
 *
 * Distinct from metrics and tracing: this answers *product* questions ("how many users
 * abandon checkout?") rather than operational ones ("is p95 latency acceptable?").
 *
 * See: docs/tools/posthog.md
 */

// `PostHog` is the Node server-side client. It buffers events in memory and flushes them in
// batches over HTTP, so `capture()` does not block the request it was called from.
import { PostHog } from 'posthog-node';
import { getActiveSpanContext } from '@infrastructure/observability/tracer';

// ─── Configuration helpers ────────────────────────────────────────────────────

/*
 * Returns true only when both API key and host are set in the environment
 * Both are required: the host is explicit because PostHog can be self-hosted or EU/US cloud,
 * and defaulting it would silently ship product data to the wrong region.
 */
export const isPostHogEnabled = (): boolean =>
    Boolean(process.env.NODE_POSTHOG_API_KEY && process.env.NODE_POSTHOG_HOST);

// Lazily created so the client is never instantiated when analytics are disabled.
// Underscore-prefixed by convention: module-private mutable state.
let _client: PostHog | undefined;

/*
 * Returns the shared PostHog client, creating it on first call
 * Only ever reached via `emitAnalyticsEvent`, which checks `isPostHogEnabled()` first —
 * that is what makes the non-null assertion on the API key below safe.
 */
const getClient = (): PostHog => {
    if (!_client) {
        // First argument is the project API key (a *write-only* key, safe on a server).
        _client = new PostHog(process.env.NODE_POSTHOG_API_KEY!, {
            // Target instance: PostHog cloud region or a self-hosted URL.
            host: process.env.NODE_POSTHOG_HOST,
            // Disable auto-flush; we flush manually on shutdown.
            // `flushAt` — send once 20 events have accumulated.
            flushAt: 20,
            // `flushInterval` — or after 10s, whichever comes first. The pair bounds both
            // request overhead (batching) and data staleness (the timer).
            flushInterval: 10_000
        });
    }
    return _client;
};

/*
 * Flush pending events and shut down the PostHog client on server stop
 * Necessary because of the buffering above: without it, up to 20 events (or 10 seconds' worth)
 * are lost on every deploy. `shutdown()` flushes the queue and waits for the request to finish.
 */
export const shutdownAnalytics = async (): Promise<void> => {
    if (_client) {
        await _client.shutdown();
        // Clear the handle so a restarted app (or a test) builds a fresh client rather than
        // reusing a shut-down one, whose `capture()` calls would silently do nothing.
        _client = undefined;
    }
};

// ─── Event taxonomy ───────────────────────────────────────────────────────────
// See docs/tools/posthog.md for the full event catalog.
//
// Re-exported rather than declared here: the names are shared with the paired frontend, which
// emits the same funnel from the other end. `analytics-events.ts` owns them and is guarded by
// `check:spec-identity`; this module owns the transport.

import { type SharedAnalyticsEventName } from '@infrastructure/observability/analytics-events';

export {
    analyticsEvents,
    type SharedAnalyticsEventName
} from '@infrastructure/observability/analytics-events';

// ─── Payload schema ───────────────────────────────────────────────────────────

/*
 * Core fields shared by every analytics event
 */
export interface AnalyticsEvent {
    /** PostHog distinct_id: authenticated user ID or a session/anonymous ID. */
    distinctId: string;
    /** Event name from the shared `analyticsEvents` catalogue. */
    event: SharedAnalyticsEventName;
    /** ISO-8601 timestamp; defaults to now if omitted. */
    timestamp?: Date;
    /** OTel trace ID for cross-signal correlation. */
    traceId?: string;
    /** Any domain-specific context. */
    properties?: Record<string, unknown>;
}

// ─── Emit helper ─────────────────────────────────────────────────────────────

/**
 * Build common analytics fields from a request context.
 * Reduces boilerplate in controllers that always pass distinctId + traceId.
 *
 * Typed as `Pick<...>` so it stays in lockstep with `AnalyticsEvent`: renaming a field there
 * breaks this signature at compile time instead of silently producing a wrong shape.
 * Usage: `analytics({ ...buildAnalyticsBase(request), event: analyticsEvents.CART_VIEWED })`
 */
export const buildAnalyticsBase = (request: {
    authContext?: { id?: string } | null;
}): Pick<AnalyticsEvent, 'distinctId' | 'traceId'> => ({
    // CAVEAT: unauthenticated traffic all collapses onto the literal 'anonymous' id, so
    // pre-login events cannot be told apart per visitor. Passing a session/cookie id instead
    // would be the fix if pre-signup funnels ever matter.
    distinctId: request.authContext?.id ?? 'anonymous',
    // Read from the ambient OTel context — no plumbing needed at the call site.
    traceId: getActiveSpanContext().traceId
});

/**
 * Send one product analytics event to PostHog.
 * Silently does nothing when PostHog is not configured — no breaking change.
 *
 * Returns `void` (fire-and-forget): analytics must never delay or fail a user request, so
 * there is nothing to await and nothing to handle.
 */
export const emitAnalyticsEvent = (event: AnalyticsEvent): void => {
    // Guard before `getClient()`, so a disabled configuration never constructs the client
    // (and never dereferences the missing API key).
    if (!isPostHogEnabled()) return;

    // `capture()` enqueues the event locally and returns immediately — the network call happens
    // on the batch flush described above.
    getClient().capture({
        // Who the event belongs to; PostHog stitches a user's timeline by this id.
        distinctId: event.distinctId,
        // The event name (see the enum).
        event: event.event,
        // Optional explicit time — pass it when back-filling, otherwise PostHog stamps now.
        timestamp: event.timestamp,
        properties: {
            // Caller-supplied domain context, spread first so the trace id cannot be overwritten.
            ...event.properties,
            // Attach OTel trace ID for log/trace/analytics correlation.
            // Conditional spread keeps the key out entirely when untraced, rather than
            // recording `trace_id: undefined` as a property value.
            ...(event.traceId ? { trace_id: event.traceId } : {})
        }
    });
};
