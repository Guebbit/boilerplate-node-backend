---
source: src/infrastructure/observability/analytics/umami.ts
sha256: 5cdba9bbdaa26b04805e976e8e6692820322344e52a47a4b06c7505a4ee6a1e3
generated_at: 2026-11-08T03:38:40.184481+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/umami.ts

## Purpose

Default analytics provider that POSTs server-side events to a self-hosted Umami instance over plain HTTP (`/api/send`), no SDK. It exists so that backend funnel steps (webhooks, scheduled jobs, queue consumers) land in the same Umami database as the browser's tracking script events.

## Key elements

- **`umamiAnalyticsProvider`** (exported) — the `AnalyticsProvider` implementation. Exposes `name`, `configured()`, `capture(event)`, `forget()`, and `shutdown()`.
- **`capture(event)`** — Fire-and-forget `fetch` POST to `{host}/api/send`. Sets `User-Agent` (required by Umami), optional `X-Forwarded-For`, and a 2 s `AbortSignal.timeout`. Not awaited; failures are logged at `debug`/`warn` and swallowed.
- **`buildEventData(event)`** — Spreads caller-supplied `properties` first, then overlays `trace_id` so the field cannot be clobbered. Deliberately omits `distinctId`.
- **`readConfig()`** — Reads `analyticsConfig()` fresh on every call (no caching) and resolves the ingest host (`NODE_UMAMI_INGEST_HOST` → `NODE_UMAMI_HOST`) and `NODE_UMAMI_WEBSITE_ID`. Strips trailing slashes. Returns `undefined` when either value is missing.
- **`stripPort(host)`** — Removes the port from a `Host` header before sending as Umami's `hostname` field; handles IPv6 literals.
- **`SERVER_USER_AGENT`** — Constant UA string used when `event.userAgent` is absent; prevents Umami from silently discarding the event (200 response, no event stored).
- **`SEND_TIMEOUT_MS`** — 2000 ms per-event ceiling.
- **`warnedAboutConfiguration`** — Module-level flag so a missing-config condition logs exactly one warning, not one per event.

## Relationships

- **`./index.ts`** — Imports the `AnalyticsEvent` and `AnalyticsProvider` types; this file is the concrete implementation that the registry in `index.ts` instantiates.
- **`@infrastructure/observability/config`** — Calls `analyticsConfig()` to obtain host and website-id values at request time.
- **`@infrastructure/adapters/logger`** — Imports `logger` for the one-time misconfiguration warning, per-response rejection warnings, and delivery-failure debug logs.

## Notes

- `capture` is **synchronous**; the network call is detached. Nothing awaits it, so a hung Umami cannot block request handling (bounded only by the 2 s signal).
- `forget()` and `shutdown()` are **no-ops**: no per-account data is sent to Umami, and in-flight beacons are intentionally not flushed to avoid stalling the shutdown chain.
- No `timestamp` field is sent — Umami stamps its own ingest time.
- `NODE_UMAMI_INGEST_HOST` is the *internal* address (e.g. a compose service name); `NODE_UMAMI_HOST` is the *public* origin the browser uses. They may differ in network topologies where the public origin is unreachable from the API container.
- Umami keys visitors on an IP + UA hash and retains events until manually deleted, which is why the account `distinctId` is never forwarded to Umami (it *is* forwarded by the PostHog provider).
- Config is re-read on every call specifically so tests that resolve environment variables at different times do not see a stale, memoised snapshot.
