---
source: src/infrastructure/observability/analytics/umami.ts
sha256: 1db40f01c5da09234006f7c0dd36c409b77795b851892ec24f22c0ae5765917c
generated_at: 2026-09-27T14:12:43.573008+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/umami.ts

## Purpose

Implements the `AnalyticsProvider` port for Umami, the self-hosted analytics service the compose stack already runs. It posts events to Umami's `/api/send` endpoint over plain HTTP (no SDK), placing server-side funnel events into the same database as browser-side tracking, so the entire shared funnel is queryable in one place.

## Key elements

- **`umamiAnalyticsProvider`** (export) — the singleton `AnalyticsProvider` object with `name`, `configured()`, `capture()`, and `shutdown()`.
- **`capture(event)`** — fire-and-forget `POST` to `{host}/api/send`. Applies a 2 s `AbortSignal.timeout`, injects a `User-Agent` (required by Umami or the event is silently dropped), sets `X-Forwarded-For` from `clientIp`, and maps event fields into Umami's `data` map. Never awaited by callers.
- **`configured()`** — returns `true` only if both `NODE_UMAMI_INGEST_HOST` (or `NODE_UMAMI_HOST`) and `NODE_UMAMI_WEBSITE_ID` are set. Used for health reporting.
- **`shutdown()`** — resolves immediately; in-flight requests are deliberately not awaited so they never block the deploy/shutdown chain.
- **`stripPort(host)`** (module-private) — removes the port from a `Host` header value before sending it as Umami's `hostname` field. Handles IPv6 bracket notation.
- **`buildEventData(event)`** (module-private) — flattens `AnalyticsEvent` into the `data` record: caller-supplied `properties` first, then `user_id` ← `distinctId`, and `trace_id` ← `traceId` (omitted if absent).
- **`readConfig()`** (module-private) — reads env vars on every call (no caching) so the value always reflects the current environment. Strips trailing slashes from the host. Falls back from `NODE_UMAMI_INGEST_HOST` to `NODE_UMAMI_HOST`.
- **`SERVER_USER_AGENT`** (module-private) — constant UA string used when `event.userAgent` is absent (webhooks, jobs, queue consumers).
- **`warnedAboutConfiguration`** (module-private) — one-shot guard so a misconfigured provider logs a warning once, not per-event.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — defines the `AnalyticsEvent` and `AnalyticsProvider` types that this file implements. The provider is registered back into the analytics registry exposed by that module.
- **`src/infrastructure/adapters/logger.ts`** — imported as `logger`; used for a one-time misconfiguration `warn`, a per-event rejection `warn` (non-OK status), and a per-event delivery-failure `debug`.

## Notes

- **User-Agent is mandatory.** Umami 2.14+ silently discards an event with no `User-Agent` header while still returning 200. The `SERVER_USER_AGENT` constant ensures the header is always present.
- **Port stripping.** Umami's collect endpoint 400s on a `hostname` that includes a port. `localhost:3000` (the default local-dev case) would be rejected without `stripPort`. IPv6 literals (`[::1]:8080`) are handled by checking the last colon's position relative to the closing bracket.
- **Two env vars, one server.** `NODE_UMAMI_HOST` is the public origin a browser loads the tracking script from (often unreachable from inside the compose network). `NODE_UMAMI_INGEST_HOST` is the address the API container can actually reach. The code prefers the ingest host and falls back to the public one for single-host setups.
- **Config is read per-call, not cached.** The analytics registry already memoises the provider instance; caching env vars here too would freeze the value at whichever test resolved first.
- **`shutdown()` is intentionally a no-op.** In-flight analytics beacons are not part of the graceful-shutdown chain; they are fire-and-forget and bounded by the 2 s timeout.
- **Mutation testing.** `Stryker disable` / `restore` annotations wrap logger calls that would create false-positive mutants (logging-only branches).
- **No `timestamp` field is sent.** Umami's `/api/send` schema has no timestamp input; it stamps its own ingest time.
