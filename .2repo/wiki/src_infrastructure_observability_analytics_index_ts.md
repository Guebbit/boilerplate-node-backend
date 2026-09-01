# src/infrastructure/observability/analytics/index.ts

## Purpose
Defines the product-analytics port (the `AnalyticsProvider` interface), the shared event/payload types, the provider registry keyed off `NODE_ANALYTICS_PROVIDER`, and the thin emit helpers that application code calls. It exists so that the rest of the codebase talks to an abstract "capture an event" seam and never imports a specific backend (Umami, PostHog, or no-op) directly.

## Key elements
- **`AnalyticsEventMap`** – Empty interface used as a declaration-merging seam; each module (e.g. `modules/cart/analytics.ts`) augments it with its own event names. `infrastructure` never imports from a module.
- **`AnalyticsEventName`** – Union of every key in `AnalyticsEventMap`; the single set of event names shared 1:1 with the frontend (enforced by `tests/cross-cutting/analytics-events.test.ts`).
- **`AnalyticsEvent`** – Payload shape: `distinctId`, `event`, optional `timestamp` (PostHog-only), `traceId`, `properties`, and three attribution fields (`clientIp`, `userAgent`, `hostname`).
- **`AnalyticsProvider`** – The port. Three methods: `capture(event): void` (fire-and-forget), `configured(): boolean`, `shutdown(): Promise<void>`.
- **`PROVIDERS`** – Registry mapping the strings `umami`, `posthog`, `none` to their singleton instances.
- **`resolveAnalyticsProvider()`** – Memoised lookup on `NODE_ANALYTICS_PROVIDER` (default `umami`). Throws on an unknown value rather than returning `undefined`.
- **`resetAnalyticsProvider()`** – Test seam; clears the memoised handle.
- **`buildAnalyticsBase(context: CallerContext)`** – Fills the per-event boilerplate (`distinctId`, `traceId` from ambient OTel context, `clientIp`, `userAgent`, `hostname`) so call sites don't repeat it.
- **`emitAnalyticsEvent(event)`** – One-liner: resolves the provider and calls `capture`. Returns `void`.
- **`shutdownAnalytics()`** – Flushes and releases the provider; no-ops if no provider was ever resolved (avoids a crash from a typo'd env var at process exit).

## Relationships
- **`src/infrastructure/observability/analytics/umami.ts` / `posthog.ts` / `none.ts`** – Provide the three `AnalyticsProvider` implementations registered in `PROVIDERS`.
- **`src/infrastructure/observability/tracer.ts`** – Supplies `getActiveSpanContext()` so `buildAnalyticsBase` can stamp `traceId` without per-call plumbing.
- **`src/infrastructure/http/request.ts`** – Source of the `CallerContext` type consumed by `buildAnalyticsBase`.
- **`src/infrastructure/runtime/server-lifecycle.ts`** – Calls `shutdownAnalytics()` last in the shutdown chain.
- **`src/modules/observability/controllers/get-observability-health.ts`** – Reports `provider.name` as `integrations.analytics` in the health endpoint.
- **`src/modules/account/services/authentication.ts` / `profile.ts` / `controllers/post-login.ts`** and **`src/modules/cart/services/checkout.ts` / `items.ts` / `reorder.ts`** – Call sites that emit events via `emitAnalyticsEvent` and augment `AnalyticsEventMap` with module-specific event names.
- **`src/modules/account/tests/integration/*.test.ts`** – Use `resetAnalyticsProvider()` to isolate provider state between test cases.

## Notes
- **Fire-and-forget contract:** `capture` returns `void` by design; a failing provider swallows the error. The only observable signal is the one-time warning from an unconfigured provider (`configured() === false`).
- **`timestamp` is PostHog-only:** Umami's `/api/send` (v2.14.0) has no timestamp field and stamps ingest time, so a replayed/backfilled event lands on the wrong date.
- **Unauthenticated collapse:** All anonymous callers share the literal `'anonymous'` distinctId. Umami still differentiates visitors via IP+UA hashing; PostHog does not.
- **Declaration-merging discipline:** `AnalyticsEventMap` is intentionally empty here. Adding a field to `AnalyticsEvent` breaks `buildAnalyticsBase` at compile time (typed `Pick`), keeping the two in lockstep.
- **Shutdown clears the memo:** After `shutdownAnalytics()` resolves, `provider` is reset to `undefined` so a restarted process (or a subsequent test) builds a fresh client instead of reusing a shut-down one.
