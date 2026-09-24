---
source: src/infrastructure/observability/analytics/index.ts
sha256: 11baf8a8e5c07d9131aebf1c55b5409f3fe57a53da6074188d235ab6e4a8d237
generated_at: 2026-09-23T17:47:47.235839+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/index.ts

## Purpose

Defines the analytics **port** (`AnalyticsProvider` interface), the **event taxonomy** (declaration-merging `AnalyticsEventMap`), the **payload schema**, and the **registry** that resolves which of three shipped implementations (`umami`, `posthog`, `none`) handles events at runtime. It exists so modules emit product analytics through a single consent-gated choke point without importing any specific backend.

## Key elements

- **`AnalyticsEventMap`** — empty interface, augmented per-module via declaration merging (e.g. `modules/cart/analytics.ts`) so infrastructure never imports from a module.
- **`AnalyticsEventName`** — union of all event names the build can emit; shared 1:1 with the frontend namespace.
- **`AnalyticsEvent`** — the wire payload: `distinctId`, `event`, optional `timestamp`, `traceId`, `properties`, `clientIp`, `userAgent`, `hostname`.
- **`AnalyticsEventInput`** — `AnalyticsEvent & { analyticsConsent: boolean }`; consent is a gate input, never stored in the captured event.
- **`AnalyticsProvider`** — the port: `name`, `capture(event): void`, `configured(): boolean`, `shutdown(): Promise<void>`. Capture is fire-and-forget by contract.
- **`PROVIDERS`** (internal) — `{ umami, posthog, none }` map; `undefined` values make a typo'd env name a real runtime error.
- **`resolveAnalyticsProvider()`** — memoised lookup driven by `NODE_ANALYTICS_PROVIDER` (default `umami`); throws on unknown name.
- **`resetAnalyticsProvider()`** — test seam to clear the memoised handle.
- **`buildAnalyticsBase(context: CallerContext)`** — fills `distinctId`, `traceId` (from ambient OTel context), `clientIp`, `userAgent`, `hostname`, `analyticsConsent` in one call.
- **`emitAnalyticsEvent(event)`** — the sole public emit path; gates on `NODE_ANALYTICS_REQUIRE_CONSENT` (default `true`, opt-in) then delegates to `provider.capture`.
- **`shutdownAnalytics()`** — flushes and releases the provider; no-ops if the provider was never resolved.

## Relationships

- **`umami.ts` / `posthog.ts` / `none.ts`** — the three `AnalyticsProvider` implementations registered in `PROVIDERS`.
- **`tracer.ts`** — provides `getActiveSpanContext()` used by `buildAnalyticsBase` to stamp `traceId` without per-call-site plumbing.
- **`environment.ts`** — supplies `environmentChoice` (provider selection) and `environmentFlag` (consent gate).
- **`required-config.ts`** — calls `resolveAnalyticsProvider()` once at boot so a typo'd `NODE_ANALYTICS_PROVIDER` fails fast before the first request.
- **`server-lifecycle.ts`** — calls `shutdownAnalytics()` as the last step in the shutdown chain.
- **`login-observability.ts`**, **`checkout.ts`**, **`authentication.ts`**, **`oauth.ts`**, **`profile.ts`** — module call sites that build events via `buildAnalyticsBase` + `emitAnalyticsEvent`.
- **Integration tests** (`oauth-link.test.ts`, `self-service.test.ts`, `service.test.ts`) — use `resetAnalyticsProvider()` to isolate per-test provider state.

## Notes

- **Declaration merging is the extension mechanism.** Modules add events by augmenting `AnalyticsEventMap` in their own file; `infrastructure` never imports from a module. Forgetting the augmentation makes the event name a compile error.
- **Consent is opt-in by default** (`NODE_ANALYTICS_REQUIRE_CONSENT` defaults to `true`). A deployment can set it to `false` if its legal review concludes server-side, non-cookie analytics need no gate.
- **Unauthenticated traffic** all gets `distinctId: 'anonymous'`. Under Umami the `clientIp` + `userAgent` hash still separates visitors; under PostHog it does not.
- **Umami discards events missing `userAgent`** — see `umami.ts` for details.
- **`timestamp` is PostHog-only.** Umami stamps ingest time, so a replayed/backfilled event lands under the wrong date there.
- **`shutdownAnalytics` clears the memoised handle** after flushing; a restarted app (or test) gets a fresh client rather than a shut-down one whose `capture()` would silently no-op.
