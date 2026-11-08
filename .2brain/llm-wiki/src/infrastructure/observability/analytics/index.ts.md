---
source: src/infrastructure/observability/analytics/index.ts
sha256: e8931019b6c931ce724cccd792b27f8d8afa0291921066e2ee19a02a339d2a0e
generated_at: 2026-11-08T03:38:09.128211+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/index.ts

## Purpose

Defines the product-analytics port (the `AnalyticsProvider` interface and the `AnalyticsEvent` / `AnalyticsEventInput` types) and the registry that maps the `NODE_ANALYTICS_PROVIDER` environment variable to one of three bundled implementations (`umami`, `posthog`, `none`). It is the single choke point every module passes through when emitting product analytics events, and it keeps the event taxonomy open for per-module augmentation without infrastructure importing from a module.

## Key elements

- **`AnalyticsEventMap`** — empty interface intended for TypeScript declaration merging; each module augments it with its own event-name keys (e.g. `modules/cart/analytics.ts`).
- **`AnalyticsEventName`** — union of all keys in `AnalyticsEventMap`; the closed set of names the build can emit.
- **`AnalyticsEvent`** — the core payload shape (`distinctId`, `event`, `timestamp?`, `traceId?`, `properties?`, `clientIp?`, `userAgent?`, `hostname?`).
- **`AnalyticsEventInput`** — `AnalyticsEvent & { analyticsConsent: boolean }`; the gate input that `emitAnalyticsEvent` accepts.
- **`AnalyticsProvider`** — the port interface: `name`, `capture(event)` (fire-and-forget, void), `configured()`, `forget(distinctId)` (GDPR Art. 17, awaited, rejects on failure), `shutdown()`.
- **`AnalyticsProviderName`** — `'umami' | 'posthog' | 'none'`.
- **`registry`** (module-private) — built with `createProviderRegistry`, maps the three names to their adapter objects.
- **`resolveAnalyticsProvider()`** — memoised resolver; reads `NODE_ANALYTICS_PROVIDER` (default `umami`) via `requireProvider` and throws on an unknown name.
- **`resetAnalyticsProvider()`** — test seam; clears the memoised handle.
- **`buildAnalyticsBase(context: CallerContext)`** — derives `distinctId`, `traceId` (from ambient OTel span), `clientIp`, `userAgent`, `hostname`, and `analyticsConsent` from the caller context so call sites don't repeat the boilerplate.
- **`emitAnalyticsEvent(event: AnalyticsEventInput)`** — the single emission point. Gates on `analyticsConfig().NODE_ANALYTICS_REQUIRE_CONSENT` (default `true`, opt-in) before delegating to `provider.capture`. Returns `void`.
- **`shutdownAnalytics()`** — flushes and releases the provider client; no-ops if no provider was ever resolved. Clears the memoised handle after shutdown.
- **`analyticsProviderProbe`** — a `defineProbe`-wrapped reference to `resolveAnalyticsProvider`, wired at boot in `src/app/config.ts` so a typo'd env var fails fast before the first request.

## Relationships

- **`@infrastructure/observability/tracer`** — imports `getActiveSpanContext` to read the active OTel trace ID for `buildAnalyticsBase`; no plumbing needed at call sites.
- **`@infrastructure/runtime/provider-registry`** — imports `createProviderRegistry` and `requireProvider` to build and resolve the provider map.
- **`@infrastructure/config/define`** — imports `defineProbe` to expose the boot-time resolution probe.
- **`@infrastructure/observability/config`** — imports `analyticsConfig` to read `NODE_ANALYTICS_PROVIDER` and `NODE_ANALYTICS_REQUIRE_CONSENT`.
- **`./umami`, `./posthog`, `./none`** — the three adapter objects registered in the provider registry.
- **`src/app/config.ts`** — registers `analyticsProviderProbe` so a misconfigured provider name is refused at boot.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — calls `shutdownAnalytics()` as the last step in the shutdown chain.
- **Module services (e.g. `modules/account/services/*`)** — augment `AnalyticsEventMap` with their event names, build events via `buildAnalyticsBase`, and emit via `emitAnalyticsEvent`. `account-deletion` additionally calls `provider.forget(distinctId)` for GDPR erasure.

## Notes

- `AnalyticsEventMap` is intentionally empty here. Modules extend it via declaration merging; infrastructure never imports from a module. A lint-disable comment documents the seam.
- `capture` is contractually fire-and-forget (returns `void`). An unconfigured provider warns once and then discards silently — check `configured()` or the health endpoint to detect this.
- `forget` is the *only* provider method that is awaited and may reject; the outbox relay retries a rejected erasure before parking it `dead`. A swallowed failure here would be a silent GDPR breach.
- `timestamp` is PostHog-only: Umami stamps ingest time, so a replayed/backfilled event lands under the wrong date if you rely on it there.
- Under Umami, `userAgent` is mandatory — the provider discards an event that arrives without one.
- The consent gate defaults to **opt-in** (`NODE_ANALYTICS_REQUIRE_CONSENT` defaults to `true`). A deployment that ships the permissive default without explicit legal basis would violate Art. 25(2) data-minimisation.
- The `traceId` is read from the ambient OTel context manager (not an ad-hoc ALS lookup), making it safe across the async hops a service-tier call introduces.
- `shutdownAnalytics` clears the memoised `provider` after flushing; a test or restarted app that reuses the stale handle would get a client whose `capture` silently does nothing.
