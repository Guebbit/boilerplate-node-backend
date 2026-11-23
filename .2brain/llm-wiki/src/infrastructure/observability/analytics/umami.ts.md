---
source: src/infrastructure/observability/analytics/umami.ts
source_sha256: 1e6c71ad1eba072f8dce07af7e8af54f2f7d8155fd63bce53b25fe08ad566e51
context_sha256: 8669642fc28e0e8d9d7aa1504ba888269f5441e3e601a3167f838f7b46412be5
generated_at: 2026-11-22T02:57:45.626833+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/analytics/umami.ts

## Purpose
Default analytics provider that sends server-side events to a self-hosted Umami instance. It posts the same payload the browser tracking script sends to `/api/send`, so backend events land in the same database as the frontend's funnels. No server SDK is needed.

## Key elements
- **`umamiAnalyticsProvider`**: the exported `AnalyticsProvider` implementation (`name: 'umami'`).
  - `configured()`: returns true only if both a host and a website id are present. Health reporting and `capture` use the same check.
  - `capture(event)`: fire-and-forget `fetch` POST to `<host>/api/send` with a 2000 ms timeout (`SEND_TIMEOUT_MS`). It is not awaited.
    - The payload has `type: 'event'`, `website`, an optional `hostname` (port stripped), `url: /server/<event>`, `name`, and `data`.
    - A non-OK response logs a `warn`. A network failure logs only at `debug`.
  - `forget()`: no-op that resolves, because the account id is never sent to Umami.
  - `shutdown()`: no-op that resolves. Nothing is buffered, and in-flight requests are deliberately not awaited so they can't hold up shutdown.
- **`readConfig()`**: reads `analyticsConfig()` on every call, with no caching.
  - It uses `NODE_UMAMI_INGEST_HOST` and falls back to `NODE_UMAMI_HOST`.
  - It requires `NODE_UMAMI_WEBSITE_ID`.
  - It strips trailing slashes from the host.
  - It returns `undefined` if either value is missing.
- **`buildEventData(event)`**: spreads `event.properties`, then adds `trace_id` from `traceId` if set. `distinctId` is intentionally omitted.
- **`stripPort(host)`**: removes the port from a `Host` header, since Umami rejects a `hostname` that includes one. It handles IPv6 literals.
- **`SERVER_USER_AGENT`**: fallback `User-Agent` used when the event has no `userAgent`.

## Relationships
- Reads provider settings through `analyticsConfig()` from `@infrastructure/observability/config`.
- Uses `logger` from `@infrastructure/adapters/logger` for the misconfiguration warning, the rejection warning and the delivery-failure debug message.

## Notes
- **Missing `User-Agent`:** Umami silently discards an event with no `User-Agent` while still returning `200` (verified against umami 2.14), so the header is always set.
- **Ingest vs public host:** `NODE_UMAMI_INGEST_HOST` is the address the API dials. `NODE_UMAMI_HOST` is the public origin the browser loads the script from, and it is often unreachable from inside the network.
- **Account id not sent:** Umami can't join on a user id and keeps events until they are deleted by hand, so the account id would outlive the account. This is why `forget()` is a no-op. PostHog keeps `distinctId`.
- **No timestamp:** `/api/send` has no timestamp field, so Umami stamps the time of ingest.
- **Misconfiguration warning:** when config is missing, a warning is logged once per process (`warnedAboutConfiguration`) and events are dropped. The message suggests setting `NODE_ANALYTICS_PROVIDER=none`.
- **`X-Forwarded-For`:** set from `clientIp` when present, so the event is attributed to the same visitor as the browser events.
- **Mutation testing:** `// Stryker disable` comments surround the logging calls.
