# src/infrastructure/observability/analytics/umami.ts

## Purpose

Default analytics provider that POSTs server-side funnel events to a self-hosted Umami instance over plain HTTP (`/api/send`). Exists so the backend half of shared funnels lands in the same `website_event` table as the browser tracking script, without a dedicated server SDK.

## Key elements

- **`umamiAnalyticsProvider`** (exported) — implements the `AnalyticsProvider` interface from `./index`.
  - `configured()` — returns `true` only when both a host and a website-id are resolvable from env.
  - `capture(event)` — fire-and-forget `fetch` POST; no promise returned. Attaches `User-Agent` (falls back to a recognisable server placeholder), `X-Forwarded-For` (client IP), a port-stripped `hostname`, and a `data` map carrying `user_id` / `trace_id` for queryability in Umami.
  - `shutdown()` — resolves immediately; in-flight requests are deliberately not awaited.
- **`SERVER_USER_AGENT`** — constant used when an event has no browser `User-Agent`; prevents silent drop by Umami's collect endpoint.
- **`stripPort(host)`** — removes a trailing `:port` from a `Host` value (IPv6-aware) because Umami's `hostname` validation rejects port-suffixed values with a `400`.
- **`readConfig()`** — reads `NODE_UMAMI_INGEST_HOST` (preferred, intra-network) or `NODE_UMAMI_HOST` (public origin) plus `NODE_UMAMI_WEBSITE_ID` fresh on every call; trims whitespace and strips trailing slashes. Returns `undefined` if either is missing.
- **`buildEventData(event)`** — spreads caller-supplied `properties` first, then overwrites with `user_id` (from `distinctId`) and optional `trace_id`, producing the `event_data` map Umami stores as queryable rows.
- **`warnedAboutConfiguration`** — module-level flag that limits the "provider misconfigured" warning to one log line per process.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — imports `logger`; used for the one-time misconfiguration warning, per-event `4xx`/`5xx` response warnings, and debug-level delivery-failure messages.
- **`src/infrastructure/observability/analytics/index.ts`** — imports the `AnalyticsEvent` and `AnalyticsProvider` types; this file is the concrete implementation that the registry in `index` selects as the default provider.

## Notes

- **User-Agent is mandatory.** Umami's `/api/send` returns `200` and silently discards events lacking a `User-Agent` header. The provider never omits it; server-originated events get the `SERVER_USER_AGENT` placeholder.
- **Two host variables, not interchangeable.** `NODE_UMAMI_HOST` is the public/browser-facing origin; `NODE_UMAMI_INGEST_HOST` is the intra-network address the API container dials. They coincide only in single-host deployments.
- **No `event.timestamp` is sent.** Umami's collect API declares no such field and stamps ingest time server-side; the caller's timestamp is preserved only in the `data` map via `properties`.
- **Fire-and-forget by design.** `capture` does not return a promise and does not `await` the fetch. The shutdown path does not drain in-flight requests, so a slow or down Umami instance never blocks deployment or request completion.
- **Config is read per-event, not cached.** The provider is memoised by the registry; caching env values here would freeze the environment at whichever test (or process) resolved first.
