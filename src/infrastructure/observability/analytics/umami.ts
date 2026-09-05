/**
 * @module
 * Umami analytics provider — the default. Umami is the self-hosted analytics the compose stack
 * already starts for the paired frontend, and this puts the backend half of every shared funnel
 * into the same database: the browser posts to `/api/send` via its tracking script, and a server
 * posts the identical payload over HTTP — the whole integration, no server SDK needed.
 *
 * See: docs/tools/analytics.md
 */

import { logger } from '@infrastructure/adapters/logger';
import type { AnalyticsEvent, AnalyticsProvider } from './index';

/**
 * Stand-in user-agent for events with no browser behind them (webhooks, scheduled jobs, queue
 * consumers). Umami's collect endpoint silently DISCARDS an event missing `User-Agent` while
 * still answering `200` (verified against umami 2.14) — the header is never left off, and this
 * keeps server-originated events visible instead of silently absent.
 */
const SERVER_USER_AGENT = 'boilerplate-node-api/server (analytics; no browser)';

/** The `data` map Umami stores as queryable `event_data` rows, one per key. */
type UmamiEventData = Record<string, unknown>;

/**
 * Strip the port from a `Host` header.
 * Umami validates `hostname` as a bare host and 400s on anything carrying a port — and `Host`
 * carries one on every non-default port, so `localhost:3000` (the whole local-dev case) would
 * otherwise be rejected outright.
 */
const stripPort = (host: string): string => {
    const lastColon = host.lastIndexOf(':');
    if (lastColon === -1) return host;
    // Only a colon after the final `]` delimits a port on an IPv6 literal.
    if (host.startsWith('[') && lastColon < host.lastIndexOf(']')) return host;
    return host.slice(0, lastColon);
};

/**
 * Read the configuration each time rather than caching it, since the registry already memoises
 * the provider — caching here too would freeze the environment at whichever test resolved first.
 *
 * `NODE_UMAMI_INGEST_HOST` and `NODE_UMAMI_HOST` are two different addresses for one server:
 * `NODE_UMAMI_HOST` is the PUBLIC origin a browser loads the tracking script from, which is often
 * unreachable from inside the network (compose's `localhost:3080` means the API container
 * itself). This dials the ingest host, falling back to the public one for single-host setups.
 */
const readConfig = (): { host: string; websiteId: string } | undefined => {
    const host = (process.env.NODE_UMAMI_INGEST_HOST ?? process.env.NODE_UMAMI_HOST)?.trim();
    const websiteId = process.env.NODE_UMAMI_WEBSITE_ID?.trim();

    if (!host || !websiteId) return undefined;

    // Trailing slash tolerated: `http://umami:3000/` and `http://umami:3000` must behave the same,
    // because one of them is what someone will paste in.
    return { host: host.replace(/\/+$/, ''), websiteId };
};

/** Warn once, not per event: a misconfigured provider would otherwise fill the log with itself. */
let warnedAboutConfiguration = false;

/**
 * Flatten an event into the `data` map: `distinctId` becomes `user_id`, trace id becomes
 * `trace_id`, so both are filterable in Umami's event-data view. Umami keys visitors on an IP +
 * user-agent hash, so this is the only place a user id can live.
 */
const buildEventData = (event: AnalyticsEvent): UmamiEventData => ({
    // Caller-supplied context first, so the fields below cannot be overwritten by a property
    // that happens to share their name.
    ...event.properties,
    user_id: event.distinctId,
    ...(event.traceId ? { trace_id: event.traceId } : {})
});

/** The Umami implementation of the analytics port — see `./index` for the contract. */
export const umamiAnalyticsProvider: AnalyticsProvider = {
    name: 'umami',

    // Both halves of `readConfig`, so health reports the same answer `capture` acts on — a host
    // without a website id is the misconfiguration this exists to surface.
    configured(): boolean {
        return readConfig() !== undefined;
    },

    capture(event: AnalyticsEvent): void {
        const config = readConfig();

        if (!config) {
            if (!warnedAboutConfiguration) {
                warnedAboutConfiguration = true;
                logger.warn({
                    message:
                        'Analytics provider is `umami` but NODE_UMAMI_INGEST_HOST (or NODE_UMAMI_HOST) / NODE_UMAMI_WEBSITE_ID are unset — events are being discarded. Set both, or set NODE_ANALYTICS_PROVIDER=none.'
                });
            }
            return;
        }

        // Fire-and-forget POST to Umami's collect endpoint — not awaited, so this returns before
        // the network call resolves. User-Agent is required or Umami drops the event (see above);
        // X-Forwarded-For attributes it to the same visitor as the browser events around it.
        fetch(`${config.host}/api/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': event.userAgent ?? SERVER_USER_AGENT,
                ...(event.clientIp ? { 'X-Forwarded-For': event.clientIp } : {})
            },
            body: JSON.stringify({
                type: 'event',
                payload: {
                    website: config.websiteId,
                    // hostname separates environments sharing one website id; url gives the
                    // event a row in the pages view instead of an empty one.
                    ...(event.hostname ? { hostname: stripPort(event.hostname) } : {}),
                    url: `/server/${event.event}`,
                    name: event.event,
                    // No timestamp: `/api/send` has no such field, so Umami stamps ingest time.
                    data: buildEventData(event)
                }
            })
        })
            .then((response) => {
                // A 404 here is the one misconfiguration Umami reports honestly: the website id
                // does not exist on that instance. Worth a log line, because every event after
                // it will fail the same way.
                if (!response.ok)
                    logger.warn({
                        message: 'Umami rejected an analytics event',
                        status: response.status,
                        event: event.event
                    });
            })
            .catch((error: unknown) => {
                // Analytics is not worth an unhandled rejection. Debug rather than warn: a
                // developer running the API without the analytics container up would otherwise
                // get one warning per request.
                logger.debug('analytics', 'Umami event delivery failed', String(error));
            });
    },

    /**
     * Nothing to flush: each event is its own request, launched as it happens. In-flight
     * requests are deliberately not awaited — the shutdown chain is on a clock, and an analytics
     * beacon is the last thing that should hold a deploy open.
     */
    shutdown(): Promise<void> {
        return Promise.resolve();
    }
};
