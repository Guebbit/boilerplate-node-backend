---
source: src/infrastructure/observability/analytics/umami.ts
sha256: 5cdba9bbdaa26b04805e976e8e6692820322344e52a47a4b06c7505a4ee6a1e3
generated_at: 2026-10-29T02:08:40.188099+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/umami.ts

## Purpose

Implements the default analytics provider by posting server-side events to Umami's `/api/send` HTTP endpoint, mirroring the browser tracking script so both halves of a shared funnel land in the same database. No server SDK is required — the integration is a single `fetch` call per event.

## Key elements

- **`umamiAnalyticsProvider`** (exported) — The `AnalyticsProvider` implementation. Exposes `name`, `configured()`, `capture()`, `forget()`, and `shutdown()`.
- **`capture(event)`** — Fire-and-forget `POST` to `${host}/api/send`. Builds the Umami payload (website id, hostname, url, event name, flat data map) and fires a non-awaited `fetch` with a 2 s `AbortSignal.timeout`. Logs a warning on non-OK responses and a debug message on network failure.
- **`configured()`** — Returns `true` when both a host and a website id resolve from config; used by the health endpoint.
- **`readConfig()`** (internal) — Reads `analyticsConfig()` on every call (no caching) and resolves `NODE_UMAMI_INGEST_HOST` with fallback to `NODE_UMAMI_HOST`. Strips trailing slashes.
- **`stripPort(host)`** (internal) — Removes a port suffix from a `Host` value, preserving IPv6 bracket syntax. Needed because Umami 400s on hostnames carrying a port.
- **`buildEventData(event)`** (internal) — Spreads caller properties first, then overlays `trace_id` if present. Deliberately omits `distinctId` (account id) to avoid persisting a user identifier in Umami.
- **`SERVER_USER_AGENT`** (internal) — Fallback `User-Agent` for server-originated events (webhooks, jobs). Umami silently discards events missing this header while still returning 200.
- **`warnedAboutConfiguration`** — Module-level flag ensuring the "missing config" warning fires at most once.
- **`forget()` / `shutdown()`** — Both no-ops: Umami never stores the account id, and each event is its own independent request with no batch buffer.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — Imports the `AnalyticsEvent` and `AnalyticsProvider` type definitions (the port contract this file fulfills).
- **`src/infrastructure/observability/config.ts`** — Imports `analyticsConfig()` to read `NODE_UMAMI_INGEST_HOST`, `NODE_UMAMI_HOST`, and `NODE_UMAMI_WEBSITE_ID` at call time.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` for the once-per-process misconfiguration warning, per-event rejection warnings, and debug-level delivery-failure messages.

## Notes

- **Two host variables, one server.** `NODE_UMAMI_HOST` is the *public* origin the browser loads; `NODE_UMAMI_INGEST_HOST` is the *internal* address the API container dials. In single-host dev they may be the same, but in compose they differ. The ingest host takes precedence.
- **`capture` is `void`, not `Promise<void>`.** The `fetch` is intentionally not awaited so request paths are never blocked by analytics. In-flight requests are also not tracked for `shutdown()`.
- **Config is read per call, not at module load.** The provider registry already memoises the instance; caching env inside would freeze the value at whichever test resolved first.
- **`forget()` is a deliberate no-op.** Umami keys visitors on an IP + user-agent hash and has no per-user deletion API, so there is nothing to purge on the server side.
- **Stryker annotations** (`// Stryker disable`) wrap all log-call sites to suppress mutation testing on logging statements.
