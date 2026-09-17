/**
 * @module
 * PostHog analytics provider — the alternative to the default `umami`, for identity-shaped
 * funnels: PostHog stitches a user's timeline by `distinct_id`, which Umami cannot do. The cost
 * is a hosted dependency, which is why it is not the default. Select with
 * `NODE_ANALYTICS_PROVIDER=posthog`, and set both `NODE_POSTHOG_API_KEY` and `NODE_POSTHOG_HOST`.
 *
 * See: docs/tools/analytics.md
 */

// `PostHog` is the Node server-side client. It buffers events in memory and flushes them in
// batches over HTTP, so `capture()` does not block the request it was called from.
import { PostHog } from 'posthog-node';
import { logger } from '@infrastructure/adapters/logger';
import type { AnalyticsEvent, AnalyticsProvider } from './index';

/**
 * Both key and host are required. The host is explicit because PostHog can be self-hosted or
 * EU/US cloud, and defaulting it would silently ship product data to the wrong region.
 */
export const isPostHogConfigured = (): boolean =>
    Boolean(process.env.NODE_POSTHOG_API_KEY && process.env.NODE_POSTHOG_HOST);

/**
 * Lazily created so the client is never instantiated when the credentials are absent.
 * Underscore-prefixed by convention: module-private mutable state.
 */
let _client: PostHog | undefined;

/**
 * Returns the shared PostHog client, creating it on first call.
 * Only ever reached past the `isPostHogConfigured()` guard in `capture` — that is what makes
 * the non-null assertion on the API key below safe.
 */
const getClient = (): PostHog => {
    // PostHog client: key is a write-only server key (safe here); host is the target region/
    // self-host URL; flushAt/flushInterval batch events and cap staleness — flushed manually on shutdown.
    _client ??= new PostHog(process.env.NODE_POSTHOG_API_KEY!, {
        host: process.env.NODE_POSTHOG_HOST,
        flushAt: 20,
        flushInterval: 10_000
    });
    return _client;
};

/** Warn once, not per event: a misconfigured provider would otherwise fill the log with itself. */
let warnedAboutConfiguration = false;

/** The PostHog implementation of the analytics port — see `./index` for the contract. */
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

        // capture() enqueues locally and returns immediately; PostHog flushes per the batching
        // config above. distinctId stitches the user's timeline; properties spreads caller data
        // first so trace_id below can't be overwritten, and is added only when the event is traced.
        getClient().capture({
            distinctId: event.distinctId,
            event: event.event,
            timestamp: event.timestamp,
            properties: {
                ...event.properties,
                ...(event.traceId ? { trace_id: event.traceId } : {})
            }
        });
    },

    /**
     * Flush pending events and shut down the client. Necessary because of the buffering above:
     * without it, up to 20 events (or 10s worth) are lost on every deploy.
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
