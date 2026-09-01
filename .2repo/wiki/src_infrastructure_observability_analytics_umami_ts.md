# src/infrastructure/observability/analytics/umami.ts

## Purpose

Implements the default `AnalyticsProvider` for the backend half of shared analytics funnels by posting events directly to a self-hosted Umami instance over HTTP (`/api/send`), mirroring the browser tracking script with no server SDK. It exists so server-side events (webhooks, jobs, API handlers) land in the same Umami database as browser events.

## Key elements

- **`umamiAnalyticsProvider`** — the exported `AnalyticsProvider` object (the sole public export).
  - `configured()` — returns `true` only when both `NODE_UMAMI_INGEST_HOST` (or fallback `NODE_UMAMI_HOST`) *and* `NODE_UMAMI_WEBSITE_ID` are set.
  - `capture(event)` — fire-and-forget `fetch` POST to `${host}/api/send`; never awaited. Falls back to `SERVER_USER_AGENT` when no browser `User-Agent` is available; sets `X-Forwarded-For` from `event.clientIp`.
  - `shutdown()` — resolves immediately; in-flight requests are intentionally not awaited.
- **`SERVER_USER_AGENT`** — constant UA string (`boilerplate-node-api/server (analytics; no browser)`) used for server-originated events, because Umami silently discards events missing a `User-Agent` header.
- **`stripPort(host)`** — removes the port from a `Host` value (with IPv6-literal awareness) because Umami rejects any `hostname` that carries a port.
- **`readConfig()`** — reads env vars on every call (not cached) and trims a trailing slash from the host; returns `undefined` when either required value is missing.
- **`buildEventData(event)`** — flattens an `AnalyticsEvent` into Umami's `event_data` map; places caller `properties` first so `user_id` and `trace_id` cannot be overwritten.
- **`warnedAboutConfiguration`** — module-level flag ensuring the "provider selected but not configured" warning is logged exactly once.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — provides the `AnalyticsEvent` and `AnalyticsProvider` types imported here; this file supplies the concrete `umami` implementation that `index.ts` registers as the default provider.
- **`src/infrastructure/adapters/logger.ts`** — provides the `logger` used for the one-shot misconfiguration warning, per-event rejection warnings (4xx/5xx), and debug-level delivery-failure logging.

## Notes

- `capture` is **fire-and-forget**: the `fetch` is never awaited, so `capture` returns before the network call completes. `shutdown` therefore does nothing.
- Umami stamps the ingest time server-side; there is no client-supplied timestamp field in the payload.
- `NODE_UMAMI_INGEST_HOST` and `NODE_UMAMI_HOST` are intentionally distinct: the former is the network-reachable address from inside the compose stack, the latter is the public origin a browser uses. The code prefers the ingest host and falls back to the public one.
- Config is re-read on every `capture` call (not memoised) so that environment changes in tests or hot-reload take effect without re-instantiating the provider.
- A 404 response is logged as a warning because it means the `websiteId` does not exist on that Umami instance and every subsequent event will fail identically.
