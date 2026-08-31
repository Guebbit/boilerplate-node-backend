/**
 * @module
 * Umami analytics provider — the default.
 *
 * Umami is the self-hosted analytics the compose stack already starts for the paired frontend,
 * and this provider puts the backend half of every shared funnel into the same database. The
 * browser posts to `/api/send` through its tracking script; a server posts the identical payload
 * over HTTP, which is the whole integration — there is no server SDK to add.
 *
 * See: docs/tools/analytics.md
 */

import { logger } from '@infrastructure/adapters/logger';
import type { AnalyticsEvent, AnalyticsProvider } from './index';

/**
 * A stand-in user-agent for events with no browser behind them.
 *
 * Umami's collect endpoint DISCARDS an event that arrives without a `User-Agent`, and answers
 * `200` while doing it: verified against umami 2.14, the same payload sent with and without the
 * header returns `200` both times and only the one carrying it appears in `website_event`. The
 * drop is therefore undetectable from the response, so the header is never left off.
 * (An unknown website id, by contrast, is a loud `404`.)
 *
 * Some events are genuinely server-originated — a webhook, a scheduled job, a queue consumer —
 * and have no caller whose header could be forwarded. A recognisable placeholder keeps those in
 * the dataset and visible as what they are, rather than silently absent.
 */
const SERVER_USER_AGENT = 'boilerplate-node-api/server (analytics; no browser)';

/** The `data` map Umami stores as queryable `event_data` rows, one per key. */
type UmamiEventData = Record<string, unknown>;

/**
 * Strip the port from a `Host` header.
 *
 * Umami validates `hostname` as a bare host and answers `400` for anything carrying a port —
 * and `Host` carries one on every non-default port, so `localhost:3000` (the entire local
 * development case) is rejected outright. The port says nothing a hostname needs to say.
 *
 * IPv6 literals arrive bracketed (`[::1]:3000`), so the split is on the LAST colon and only
 * when it follows the closing bracket; a bare `[::1]` is left alone.
 */
const stripPort = (host: string): string => {
    const lastColon = host.lastIndexOf(':');
    if (lastColon === -1) return host;
    // Only a colon after the final `]` delimits a port on an IPv6 literal.
    if (host.startsWith('[') && lastColon < host.lastIndexOf(']')) return host;
    return host.slice(0, lastColon);
};

/**
 * Read the configuration each time rather than caching it.
 *
 * The provider is memoised by the registry, so caching here as well would freeze the
 * environment at whichever test happened to resolve first.
 *
 * `NODE_UMAMI_INGEST_HOST` and `NODE_UMAMI_HOST` are two different addresses for one server and
 * are not interchangeable. `NODE_UMAMI_HOST` is declarative — the PUBLIC origin a browser loads
 * the tracking script from, reported by `GET /observability/health`. This provider dials Umami
 * from inside the network, where that public origin is frequently wrong: in compose it is
 * `http://localhost:3080`, and `localhost` inside the API container is the API. Hence the
 * dedicated ingest variable, falling back to the public one for the single-host deployments
 * where they genuinely are the same.
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
 * Flatten an event into the `data` map.
 *
 * `distinctId` becomes `user_id` and the trace id becomes `trace_id`, so both are filterable in
 * Umami's event-data view — Umami keys visitors on an IP + user-agent hash, so this is the only
 * place a user id can live, and the only way a funnel here can be narrowed to one account.
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

        // No `await`, and no returned promise: the contract is fire-and-forget, so the request
        // is launched and the request that triggered it carries on immediately.
        fetch(`${config.host}/api/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Umami derives browser/OS from this, and drops the event without it.
                'User-Agent': event.userAgent ?? SERVER_USER_AGENT,
                // Umami hashes the caller's address into the visitor id. Forwarding the original
                // client address is what makes a server-side event attribute to the same visitor
                // as the browser events around it, instead of to the API container.
                ...(event.clientIp ? { 'X-Forwarded-For': event.clientIp } : {})
            },
            body: JSON.stringify({
                type: 'event',
                payload: {
                    website: config.websiteId,
                    // Both optional to Umami, both worth sending: `hostname` separates
                    // environments sharing one website id, and `url` gives the event a row in
                    // the pages view instead of an empty one.
                    ...(event.hostname ? { hostname: stripPort(event.hostname) } : {}),
                    url: `/server/${event.event}`,
                    name: event.event,
                    // No `event.timestamp`: `/api/send` declares no such field, so Umami stamps
                    // ingest time. See the field's docblock in `./index`.
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
     * Nothing to flush: each event is its own request, launched as it happens.
     *
     * In-flight requests are deliberately not awaited — the shutdown chain is on a clock, and an
     * analytics beacon is the last thing that should hold a deploy open.
     */
    shutdown(): Promise<void> {
        return Promise.resolve();
    }
};
