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
import { analyticsConfig } from '@infrastructure/observability/config';

/** Upper bound on the final flush — see `shutdown` below. */
const SHUTDOWN_TIMEOUT_MS = 3000;

/**
 * Both key and host are required. The host is explicit because PostHog can be self-hosted or
 * EU/US cloud, and defaulting it would silently ship product data to the wrong region.
 */
const isPostHogConfigured = (): boolean =>
    Boolean(analyticsConfig().NODE_POSTHOG_API_KEY && analyticsConfig().NODE_POSTHOG_HOST);

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
    _client ??= new PostHog(analyticsConfig().NODE_POSTHOG_API_KEY!, {
        host: analyticsConfig().NODE_POSTHOG_HOST,
        flushAt: 20,
        flushInterval: 10_000
    });
    return _client;
};

/** Upper bound on the erasure call, so a hung PostHog fails the attempt and the relay retries. */
const FORGET_TIMEOUT_MS = 10_000;

/** What `persons/bulk_delete` answers: how many persons matched, and any it could not delete. */
interface BulkDeleteResponse {
    persons_found?: number;
    deletion_errors?: unknown[];
}

/**
 * The management-API settings erasure needs, or `undefined` when any of the three is unset.
 * Separate from the capture keys: deleting needs a personal key with `person:write`, on a
 * host that differs from the ingestion one.
 */
const readErasureConfig = ():
    | { apiKey: string; projectId: string; apiHost: string }
    | undefined => {
    const {
        NODE_POSTHOG_PERSONAL_API_KEY: apiKey,
        NODE_POSTHOG_PROJECT_ID: projectId,
        NODE_POSTHOG_API_HOST: apiHost
    } = analyticsConfig();
    return apiKey && projectId && apiHost ? { apiKey, projectId, apiHost } : undefined;
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
                // Stryker disable all
                logger.warn({
                    message:
                        'Analytics provider is `posthog` but NODE_POSTHOG_API_KEY / NODE_POSTHOG_HOST are unset — events are being discarded. Set both, or set NODE_ANALYTICS_PROVIDER=none.'
                });
                // Stryker restore all
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
     * Delete the person and, with `delete_events`, every event keyed to it. A no-op without the
     * three erasure knobs: capture keeps working, only the deletion is skipped.
     * `persons_found: 0` resolves, so a replayed erasure is harmless.
     * https://posthog.com/docs/api/persons#post-api-projects-project_id-persons-bulk_delete
     *
     * @throws {Error} on a non-2xx answer or a non-empty `deletion_errors`
     */
    forget(distinctId: string): Promise<void> {
        const config = readErasureConfig();
        if (!config) return Promise.resolve();

        // Bearer: a PERSONAL api key (not the `phc_` project key), scope `person:write`.
        // `distinct_ids` matches on the id we sent; `delete_events` also queues the person's
        // events for PostHog's batch deletion.
        return fetch(
            `${config.apiHost}/api/projects/${encodeURIComponent(config.projectId)}/persons/bulk_delete/`,
            {
                method: 'POST',
                signal: AbortSignal.timeout(FORGET_TIMEOUT_MS),
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({ distinct_ids: [distinctId], delete_events: true })
            }
        ).then((response) => {
            if (!response.ok)
                throw new Error(`PostHog person deletion refused with status ${response.status}`);
            return (response.json() as Promise<BulkDeleteResponse>).then((body) => {
                if (body.deletion_errors?.length)
                    throw new Error('PostHog reported errors deleting the person');
            });
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
        // Bounded well inside the process's own shutdown deadline: the library default (30s)
        // outlasts it, and a forced exit then skips the trace flush that runs after this.
        // https://posthog.com/docs/libraries/node#shutdown
        return closing.shutdown(SHUTDOWN_TIMEOUT_MS);
    }
};
