---
source: src/infrastructure/observability/analytics/umami.ts
sha256: a5b9df809486fd8ccfafae33aa60049f9fcbe957c329bed3213f4bf0c338bafb
generated_at: 2026-10-14T08:04:56.886434+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/umami.ts

## Purpose

The default analytics provider for the backend. It implements the `AnalyticsProvider` port by POSTing each event as a plain HTTP request to Umami's `/api/send` collect endpoint — the same endpoint the browser tracking script hits — so server-side and client-side events land in the same Umami database without a server SDK.

## Key elements

- **`umamiAnalyticsProvider`** (exported) — the `AnalyticsProvider` implementation. Exposes `name`, `configured()`, `capture(event)`, and `shutdown()`.
- **`stripPort(host)`** — removes a port from a `Host`/hostname value. Handles IPv6 bracket notation. Required because Umami 400s on any hostname carrying a port.
- **`readConfig()`** — reads `analyticsConfig()` fresh on every call (deliberately uncached) and returns `{ host, websiteId }` or `undefined`. Tries `NODE_UMAMI_INGEST_HOST` first, falls back to `NODE_UMAMI_HOST`; strips trailing slashes.
- **`buildEventData(event)`** — maps an `AnalyticsEvent` onto Umami's `data` object. Caller-supplied `properties` are spread first so they cannot be overwritten by the reserved keys `user_id` and `trace_id`.
- **`SERVER_USER_AGENT`** — fallback `User-Agent` for events with no browser (webhooks, cron, queue consumers). Umami silently drops events missing this header while still returning 200.
- **`SEND_TIMEOUT_MS`** (2000 ms) — `AbortSignal.timeout` bound on each fetch to prevent a hung Umami from holding sockets indefinitely.
- **`warnedAboutConfiguration`** — module-level flag ensuring the "provider selected but not configured" warning fires at most once.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — provides the `AnalyticsProvider` interface and `AnalyticsEvent` type that this file implements/consumes. This file is the concrete Umami adapter registered against that port.
- **`src/infrastructure/observability/config.ts`** — source of `analyticsConfig()`, which supplies the Umami host, ingest host, and website ID environment variables.
- **`src/infrastructure/adapters/logger.ts`** — provides the `logger` used for the one-time misconfiguration warning, per-event rejection warnings, and debug-level delivery-failure logs.

## Notes

- **Fire-and-forget by design.** `capture()` launches a `fetch` and returns immediately; `shutdown()` is a no-op. In-flight requests are intentionally not awaited so analytics never holds a deploy/shutdown open.
- **Two host variables for one server.** `NODE_UMAMI_HOST` is the *public* origin (what the browser uses); `NODE_UMAMI_INGEST_HOST` is the *internal* address reachable from the API container. In a compose network these differ (`localhost:3080` vs. `umami:3080`).
- **Config is re-read per event** to avoid freezing the environment at whichever test resolved first (the registry memoises the provider, not its config reads).
- **`X-Forwarded-For`** is set from `event.clientIp` so Umami attributes the server event to the same visitor as surrounding browser events.
- **No `timestamp` field** is sent: Umami's `/api/send` schema has no such field and stamps its own ingest time.
- A **404 response** specifically indicates a wrong/unknown website ID and is the one error Umami reports "honestly" — it's logged at `warn` because every subsequent event will fail identically.
