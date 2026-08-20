/**
 * PostHog analytics provider.
 *
 * The alternative to the default `umami`, for projects whose funnels are identity-shaped:
 * PostHog stitches a user's timeline by `distinct_id`, so "this logged-in user did X then Y"
 * is a question it can answer and Umami cannot. The cost is a hosted dependency in an otherwise
 * self-hosted estate, which is why it is not the default.
 *
 * Select with `NODE_ANALYTICS_PROVIDER=posthog`, and set both `NODE_POSTHOG_API_KEY` and
 * `NODE_POSTHOG_HOST`.
 *
 * See: docs/tools/analytics.md
 */

// `PostHog` is the Node server-side client. It buffers events in memory and flushes them in
// batches over HTTP, so `capture()` does not block the request it was called from.
import { PostHog } from 'posthog-node';
import { logger } from '@infrastructure/adapters/logger';
import type { AnalyticsEvent, AnalyticsProvider } from './index';

/*
 * Both key and host are required. The host is explicit because PostHog can be self-hosted or
 * EU/US cloud, and defaulting it would silently ship product data to the wrong region.
 */
export const isPostHogConfigured = (): boolean =>
    Boolean(process.env.NODE_POSTHOG_API_KEY && process.env.NODE_POSTHOG_HOST);

// Lazily created so the client is never instantiated when the credentials are absent.
// Underscore-prefixed by convention: module-private mutable state.
let _client: PostHog | undefined;

/*
 * Returns the shared PostHog client, creating it on first call.
 * Only ever reached past the `isPostHogConfigured()` guard in `capture` — that is what makes
 * the non-null assertion on the API key below safe.
 */
const getClient = (): PostHog => {
    // First argument is the project API key (a *write-only* key, safe on a server).
    _client ??= new PostHog(process.env.NODE_POSTHOG_API_KEY!, {
        // Target instance: PostHog cloud region or a self-hosted URL.
        host: process.env.NODE_POSTHOG_HOST,
        // Disable auto-flush; we flush manually on shutdown.
        // `flushAt` — send once 20 events have accumulated.
        flushAt: 20,
        // `flushInterval` — or after 10s, whichever comes first. The pair bounds both
        // request overhead (batching) and data staleness (the timer).
        flushInterval: 10_000
    });
    return _client;
};

/** Warn once, not per event: a misconfigured provider would otherwise fill the log with itself. */
let warnedAboutConfiguration = false;

export const posthogAnalyticsProvider: AnalyticsProvider = {
    name: 'posthog',

    configured(): boolean {
        return isPostHogConfigured();
    },

    capture(event: AnalyticsEvent): void {
        if (!isPostHogConfigured()) {
            if (!warnedAboutConfiguration) {
                warnedAboutConfiguration = true;
                logger.warn({
                    message:
                        'Analytics provider is `posthog` but NODE_POSTHOG_API_KEY / NODE_POSTHOG_HOST are unset — events are being discarded. Set both, or set NODE_ANALYTICS_PROVIDER=none.'
                });
            }
            return;
        }

        // `capture()` enqueues the event locally and returns immediately — the network call
        // happens on the batch flush described above.
        getClient().capture({
            // Who the event belongs to; PostHog stitches a user's timeline by this id.
            distinctId: event.distinctId,
            // The event name (see the shared catalogue).
            event: event.event,
            // Optional explicit time — pass it when back-filling, otherwise PostHog stamps now.
            timestamp: event.timestamp,
            properties: {
                // Caller-supplied domain context, spread first so the fields below cannot be
                // overwritten by a property that happens to share their name.
                ...event.properties,
                // Attach OTel trace ID for log/trace/analytics correlation. Conditional spread
                // keeps the key out entirely when untraced, rather than recording
                // `trace_id: undefined` as a property value.
                ...(event.traceId ? { trace_id: event.traceId } : {})
            }
        });
    },

    /**
     * Flush pending events and shut down the client.
     *
     * Necessary because of the buffering above: without it, up to 20 events (or 10 seconds'
     * worth) are lost on every deploy. `shutdown()` flushes the queue and waits for the request
     * to finish.
     */
    shutdown(): Promise<void> {
        if (!_client) return Promise.resolve();
        const closing = _client;
        // Cleared before the flush resolves, so a `capture()` racing the shutdown builds a fresh
        // client rather than enqueueing onto one that is closing.
        _client = undefined;
        return closing.shutdown();
    }
};
