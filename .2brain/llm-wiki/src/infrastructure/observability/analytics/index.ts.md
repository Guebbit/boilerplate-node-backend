---
source: src/infrastructure/observability/analytics/index.ts
source_sha256: a80831d9c718575cd5b08b3928f8c5fa1970b3f1ce4440707868fd6a7cf5350e
context_sha256: ddc32a469c3cbbabdae02dc6f9690212f12f67492621c4dea91588bd8a01350f
generated_at: 2026-11-22T02:57:12.263062+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/analytics/index.ts

## Purpose
Defines the product-analytics port (`AnalyticsProvider`), the event/payload types, and a registry of the three shipped implementations (`umami`, `posthog`, `none`). It answers product questions, not operational ones (metrics/tracing). The active provider is chosen by `NODE_ANALYTICS_PROVIDER` (default `umami`). It also hosts the consent gate every event passes through.

## Key elements
- **`AnalyticsEventMap`**: an intentionally empty interface that modules augment via declaration merging with their own event names, so `infrastructure` never imports from a module.
- **`AnalyticsEventName`**: union of all event names declared across `AnalyticsEventMap`.
- **`AnalyticsEvent`**: the core payload: `distinctId`, `event`, optional `timestamp`, `traceId`, `properties`, plus attribution fields `clientIp`, `userAgent` and `hostname`.
- **`AnalyticsEventInput`**: `AnalyticsEvent` plus a required `analyticsConsent: boolean`. Consent is a gate input, not event data, so providers never receive it.
- **`AnalyticsProviderName`**: `'umami' | 'posthog' | 'none'`.
- **`AnalyticsProvider`**: the port, with these members:
  - `name`: reported by `GET /observability/health` as `integrations.analytics`.
  - `capture(event)`: fire-and-forget.
  - `configured()`: reports whether the provider has what it needs to deliver an event.
  - `forget(distinctId)`: awaited GDPR Art. 17 erasure that rejects on failure.
  - `shutdown()`: flushes buffers and releases the client.
- **`resolveAnalyticsProvider()`**: lazily resolves and memoises the provider through `requireProvider`. It throws on an unknown provider name.
- **`resetAnalyticsProvider()`**: test seam that clears the memoised provider.
- **`buildAnalyticsBase(context)`**: builds the repeated fields from a `CallerContext`: `distinctId` (`caller.id ?? 'anonymous'`), `traceId` from the active OTel span, IP, user agent, host and `analyticsConsent`.
- **`emitAnalyticsEvent(event)`**: strips `analyticsConsent`, drops the event when `NODE_ANALYTICS_REQUIRE_CONSENT` is on and consent is not given, and otherwise calls `capture` on the resolved provider.
- **`shutdownAnalytics()`**: shuts down the provider if one was resolved, then clears the handle. It is a no-op otherwise.
- **`analyticsProviderProbe`**: a `defineProbe('analytics-provider', resolveAnalyticsProvider)` boot probe.

## Relationships
- **`src/infrastructure/observability/analytics/umami.ts`, `src/infrastructure/observability/analytics/posthog.ts`, `src/infrastructure/observability/analytics/none.ts`**: the adapters registered in the local `createProviderRegistry` call. Adding a provider means a new adapter file plus a registry entry.
- **`src/infrastructure/runtime/provider-registry.ts`**: supplies `createProviderRegistry` and `requireProvider`.
- **`src/infrastructure/observability/config.ts`**: `analyticsConfig()` supplies `NODE_ANALYTICS_PROVIDER` and `NODE_ANALYTICS_REQUIRE_CONSENT`.
- **`src/infrastructure/observability/span-context.ts`**: `getActiveSpanContext()` supplies the `traceId`.
- **`src/infrastructure/config/define.ts`**: `defineProbe` builds the boot probe.
- **`src/app/config.ts`**: wires `analyticsProviderProbe` so a bad provider name is refused at boot.
- **`src/infrastructure/runtime/server-lifecycle.ts`**: calls shutdown last in the stop chain.
- **Account module files** (`src/modules/account/module.ts`, `src/modules/account/services/account-deletion.ts`, `src/modules/account/services/logout.ts`, `src/modules/account/services/oauth.ts`): neighbors in the dependency graph that use this module's emit and erasure API. The page's source doesn't show the exact call sites.
- **`src/infrastructure/http/middlewares/idempotency.ts`** and **`src/kernel/registry.ts`**: listed as graph neighbors, but no direct interaction is visible in this file.

## Notes
- Consent is opt-in. `NODE_ANALYTICS_REQUIRE_CONSENT` defaults to `true` (GDPR Art. 25(2)). Aggregate counts without consent belong in a metric, not here.
- `analyticsConsent` is required on `AnalyticsEventInput`, so a call site that forgets it fails to compile.
- Unauthenticated events all share `distinctId: 'anonymous'`. Umami still separates visitors by IP and user-agent hash; PostHog does not.
- `timestamp` is honoured only by PostHog. Umami (pinned v2.14.0) stamps ingest time, and it discards events that have no `userAgent`.
- `capture` swallows failures, but `forget` rejects so the outbox relay can retry and park the erasure as `dead`.
- `shutdownAnalytics` deliberately does not resolve a provider. Doing so would turn a typo'd env var into a crash on exit.
- The config cannot import the resolver, because the resolver imports the config. That is why the probe is shape-less.
- The event-name taxonomy is shared 1:1 with the frontend, with one emitter per event, enforced by `tests/cross-cutting/analytics-events.test.ts`.
