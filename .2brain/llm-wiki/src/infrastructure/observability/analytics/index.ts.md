---
source: src/infrastructure/observability/analytics/index.ts
sha256: 0c568d56a73e400dda1fb98757c13d503d599e81dada7586567ba56f26744357
generated_at: 2026-11-14T18:10:31.900370+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/index.ts

## Purpose

Defines the product-analytics port (`AnalyticsProvider`) and the registry of the three shipped implementations (Umami, PostHog, none). It answers *product* questions (funnels, event counts), not operational ones, and centralises the consent gate, event shape, and provider lifecycle so that modules emit events through a single choke point without knowing which backend is active.

## Key elements

- **`AnalyticsEventMap`** – Empty interface, deliberately a declaration-merging seam. Each module (e.g. `modules/cart/analytics.ts`) augments it with its own event names so `infrastructure` never imports from a module.
- **`AnalyticsEvent` / `AnalyticsEventInput`** – Core event shape (distinctId, event, traceId, properties, clientIp, userAgent, hostname, optional timestamp). `AnalyticsEventInput` adds the required `analyticsConsent` boolean.
- **`AnalyticsProvider`** – The port: `capture(event)` (fire-and-forget), `configured()`, `forget(distinctId)` (awaited, rejects on failure for GDPR Art. 17), `shutdown()`.
- **`registry`** – `createProviderRegistry` mapping the three names to their adapter singletons.
- **`resolveAnalyticsProvider()`** – Memoised lazy resolution from `NODE_ANALYTICS_PROVIDER` (default `umami`); throws on an unrecognised value.
- **`buildAnalyticsBase(context)`** – Fills `distinctId`, `traceId` (via ambient OTel span context), `clientIp`, `userAgent`, `hostname`, and `analyticsConsent` from a `CallerContext`.
- **`emitAnalyticsEvent(event)`** – The single emit point. Gates on `NODE_ANALYTICS_REQUIRE_CONSENT` (defaults `true` → opt-in), then calls `capture`. Returns `void`.
- **`shutdownAnalytics()`** – Flushes buffered events and releases the client; clears the memoised handle.
- **`analyticsProviderProbe`** – `defineProbe` wired at boot in `src/app/config.ts` so a typo in the env var is rejected before the first request.
- **`resetAnalyticsProvider()`** – Test seam to clear the memoised provider between cases.

## Relationships

- **`src/infrastructure/observability/span-context.ts`** – `buildAnalyticsBase` reads the active trace ID via `getActiveSpanContext()`.
- **`src/infrastructure/runtime/provider-registry.ts`** – Provides `createProviderRegistry` / `requireProvider` used to build the registry and resolve the active provider.
- **`src/infrastructure/config/define.ts`** – Supplies `defineProbe` for the boot-time health probe.
- **`src/infrastructure/observability/config.ts`** – Source of `analyticsConfig()` (env values like `NODE_ANALYTICS_PROVIDER`, `NODE_ANALYTICS_REQUIRE_CONSENT`).
- **`./umami`, `./posthog`, `./none`** – The three concrete `AnalyticsProvider` adapters registered at module load.
- **`src/app/config.ts`** – Calls `analyticsProviderProbe` during boot to fail fast on a bad provider name.
- **`src/infrastructure/runtime/server-lifecycle.ts`** – Calls `shutdownAnalytics()` as the last step in the shutdown chain.
- **`src/modules/account/module.ts`, `src/modules/account/services/account-deletion.ts`, `src/modules/account/services/logout.ts`, `src/modules/account/services/oauth.ts`, `src/kernel/registry.ts`, `src/infrastructure/http/middlewares/idempotency.ts`** – Downstream consumers that import the port, event types, and emit helpers defined here.

## Notes

- `AnalyticsEventMap` is **intentionally empty** in this file; it is never "complete" until every module's `analytics.ts` declaration-merging file is included in the build. Adding an event name to a module without its augmentation file is a silent no-op.
- `timestamp` is **PostHog-only**. Umami (v2.14.0 pinned) has no timestamp field in `/api/send` and stamps ingest time, so replayed/backfilled events land on the wrong date there.
- **Umami discards** an event that arrives without `userAgent`. PostHog does not require it.
- Unauthenticated traffic all shares `distinctId: 'anonymous'`. Under Umami the IP + user-agent hash still separates visitors; under PostHog it does not.
- `capture` is fire-and-forget by contract (analytics must never delay a request); `forget` is the opposite — it is awaited and **rejects** on failure so the outbox relay can retry and eventually park it as `dead`. A swallowed erasure is treated as a silent GDPR breach.
- The provider handle is memoised on first use. A restarted process (or test) must call `resetAnalyticsProvider()` before resolving again, otherwise it reuses a shut-down client whose `capture` calls silently do nothing.
