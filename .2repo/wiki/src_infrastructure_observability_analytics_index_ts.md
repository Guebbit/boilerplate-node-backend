# src/infrastructure/observability/analytics/index.ts

## Purpose

Defines the product-analytics port and its registry. It answers product questions ("how many users abandon checkout?") as distinct from metrics/tracing, and lets callers emit events without knowing which backend receives them. The concrete provider is a deployment decision made via `NODE_ANALYTICS_PROVIDER` (default `umami`), mirroring the `NODE_PAYMENT_PROVIDER` pattern.

## Key elements

- **`AnalyticsEventMap`** – Empty interface, deliberately a declaration-merging seam. Each domain module (e.g. `modules/cart/analytics.ts`) augments it with its own event names; this file stays domain-agnostic.
- **`AnalyticsEventName`** – Union of all keys across every augmented map; the server-side half of a namespace shared with the frontend contract.
- **`AnalyticsEvent`** – Shape of a single event: `distinctId`, `event`, optional `timestamp` (PostHog-only), `traceId`, `properties`, and attribution fields (`clientIp`, `userAgent`, `hostname`).
- **`AnalyticsProvider`** – The port interface: `name`, `capture(event): void` (fire-and-forget), `configured(): boolean`, `shutdown(): Promise<void>`.
- **`PROVIDERS`** – Closed registry mapping the strings `umami`, `posthog`, `none` to their singleton implementations.
- **`resolveAnalyticsProvider()`** – Memoised, lazy resolution from `NODE_ANALYTICS_PROVIDER`. Throws on an unrecognised value so a typo fails at boot rather than silently discarding events.
- **`resetAnalyticsProvider()`** – Test seam; clears the memoised handle so a new env value takes effect.
- **`buildAnalyticsBase(context)`** – Populates the shared attribution fields (`distinctId`, `traceId`, `clientIp`, `userAgent`, `hostname`) from a `CallerContext` so call sites don't repeat the boilerplate.
- **`emitAnalyticsEvent(event)`** – Single-line convenience: resolve the provider and call `capture`. Returns `void`; callers must not await or catch.
- **`shutdownAnalytics()`** – Flushes and releases the provider, then clears the memoised handle. Resolves as a no-op if no provider was ever resolved.

## Relationships

- **`./umami`, `./posthog`, `./none`** – Imported as the three registry values; each satisfies `AnalyticsProvider`.
- **`@infrastructure/observability/tracer`** – `getActiveSpanContext()` supplies the `traceId` for `buildAnalyticsBase`.
- **`@infrastructure/http/request`** – `CallerContext` type is the input to `buildAnalyticsBase`.
- **`src/infrastructure/runtime/server-lifecycle.ts`** – Calls `shutdownAnalytics()` last in the shutdown chain.
- **`src/modules/observability/controllers/get-observability-health.ts`** – Reports the active provider's `name` as `integrations.analytics`.
- **Domain services** (`cart/services/checkout.ts`, `cart/services/items.ts`, `cart/services/reorder.ts`, `account/services/authentication.ts`, `account/services/profile.ts`, `account/controllers/post-login.ts`, `orders/service.ts`) – Call `emitAnalyticsEvent` / `buildAnalyticsBase` to record product events.
- **`src/modules/account/tests/integration/self-service.test.ts`** – Uses `resetAnalyticsProvider()` to swap providers per test case.

## Notes

- **Anonymous collapse.** Unauthenticated callers all map to `distinctId: 'anonymous'`. Under Umami the IP + user-agent hash still separates visitors; under PostHog it does not.
- **Umami drops events without `userAgent`.** See `umami.ts` for the guard; a missing field means the event is silently discarded by the backend.
- **`timestamp` is PostHog-only.** Umami (v2.14.0 pinned) stamps ingest time and has no timestamp field in `/api/send`, so backfilled events land under the wrong date there.
- **Fire-and-forget contract.** `capture` returns `void`; a provider that fails does so quietly. The `configured()` check exists precisely because nothing else can observe a missing-credentials misconfiguration.
- **Lazy resolution.** The provider is not resolved at import time so that `.env` loading and per-test env mutations work correctly.
- **`PROVIDERS` is a `Record<string, …>`** (not a sealed enum) so the union of keys is discoverable, but the throw on unknown names keeps typos loud.
