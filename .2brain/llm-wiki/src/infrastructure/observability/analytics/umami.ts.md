---
source: src/infrastructure/observability/analytics/umami.ts
sha256: 7a08d20fd5544f231d353cf3aa0713893a5cd88261e874e9dee7ba4bc3c04a9b
generated_at: 2026-09-23T17:48:14.846217+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/umami.ts

## Purpose

Implements the `AnalyticsProvider` port as a self-hosted Umami client. Instead of a server SDK, it fires a raw `POST` to Umami's `/api/send` endpoint with the same JSON payload the browser tracking script sends, so server-side events land in the same database and share the same visitor identity (IP + user-agent hash) as browser events.

## Key elements

- **`umamiAnalyticsProvider`** (exported) — the provider object implementing the `AnalyticsProvider` contract from `./index`.
    - `configured()` — returns `true` only when both a host and a `websiteId` are present in the environment.
    - `capture(event)` — builds the Umami payload and issues a fire-and-forget `fetch` POST. Logs a warning (once) if config is missing; logs a debug line on network failure.
    - `shutdown()` — no-op (`Promise.resolve()`); in-flight requests are intentionally not awaited so analytics never delays process exit.
- **`SERVER_USER_AGENT`** — constant header value used when an event has no browser-supplied user-agent (webhooks, cron jobs). Umami silently discards events without a `User-Agent` while still returning `200`, so this header is never omitted.
- **`stripPort(host)`** — removes the port from a `Host`/`hostname` value (handles IPv6 bracket notation). Umami rejects any `hostname` containing a port with a `400`.
- **`readConfig()`** — reads `NODE_UMAMI_INGEST_HOST` (preferred) or `NODE_UMAMI_HOST` plus `NODE_UMAMI_WEBSITE_ID` from `process.env` on every call. Returns `undefined` when either is missing. Trailing slashes are trimmed from the host.
- **`buildEventData(event)`** — flattens caller-supplied `properties` into the `data` map, then sets `user_id` (from `distinctId`) and `trace_id` (from `traceId`). Caller properties are spread first so the reserved keys win.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — source of the `AnalyticsEvent` and `AnalyticsProvider` types that this file implements. The registry in `index` memoises the provider instance, so `umamiAnalyticsProvider` is constructed once.
- **`src/infrastructure/adapters/logger.ts`** — provides the `logger` used for the one-time misconfiguration warning, per-event rejection warnings (non-`ok` response), and debug-level delivery-failure messages.

## Notes

- **Config is read per-call, not cached.** The provider is already memoised by the registry; caching env inside the provider would freeze values at whichever test (or container) resolved first.
- **Two host env vars, one server.** `NODE_UMAMI_INGEST_HOST` is the address reachable _from the API container_ (e.g. `umami:3000` in Compose); `NODE_UMAMI_HOST` is the _public_ origin the browser's tracking script loads from. The ingest host takes precedence.
- **`hostname` is optional in the payload.** When present it must be port-stripped; when absent Umami omits the field. The `url` field is synthesised as `/server/<event-name>` so the event appears in Umami's pages view.
- **No timestamp field is sent.** Umami's `/api/send` API has no timestamp input; it stamps its own ingest time.
- **Stryker mutability kill-switches** (`// Stryker disable all`) wrap every log call so mutation testing doesn't score out "removed log line" mutants as meaningful.
- **Warning deduplication.** `warnedAboutConfiguration` ensures the "provider set but env missing" warning fires exactly once per process, not once per dropped event.
