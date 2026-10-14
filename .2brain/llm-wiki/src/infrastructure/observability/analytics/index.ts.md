---
source: src/infrastructure/observability/analytics/index.ts
sha256: 31a0aa7c4685c4b925559ab0500b6fcb89a0f99b45b3f655b917821b977697e5
generated_at: 2026-10-14T08:04:18.375595+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/index.ts

## Purpose

Defines the **product analytics port** — the interface, event schema, provider registry, and emit helpers that every module uses to record product-behaviour events (distinct from operational metrics/tracing). The active backend (`umami`, `posthog`, or `none`) is selected at deploy time via `NODE_ANALYTICS_PROVIDER`, keeping the port stable regardless of which collector is wired in.

## Key elements

- **`AnalyticsEventMap`** – Deliberately empty interface; each module augments it via declaration merging so `infrastructure` never imports a module.
- **`AnalyticsEventName`** – Union of all declared event names across enabled modules.
- **`AnalyticsEvent`** – Core event shape: `distinctId`, `event`, optional `timestamp`, `traceId`, `properties`, `clientIp`, `userAgent`, `hostname`.
- **`AnalyticsEventInput`** – `AnalyticsEvent` plus the required `analyticsConsent: boolean` gate.
- **`AnalyticsProvider`** – The port: `name`, `capture(event)`, `configured()`, `shutdown()`.
- **`registry` / `registerAnalyticsProvider`** – Provider registry seeded with `umami`, `posthog`, `none`; extensible at runtime without editing this file.
- **`resolveAnalyticsProvider()`** – Lazy, memoised lookup keyed on `NODE_ANALYTICS_PROVIDER`; throws on an unknown name.
- **`resetAnalyticsProvider()`** – Test seam to clear the memoised handle.
- **`buildAnalyticsBase(context)`** – Fills the six common fields from a `CallerContext` (distinctId, traceId, clientIp, userAgent, hostname, consent).
- **`emitAnalyticsEvent(event)`** – Single choke point: applies the consent gate (`NODE_ANALYTICS_REQUIRE_CONSENT`) then calls `capture`. Fire-and-forget.
- **`shutdownAnalytics()`** – Flushes the provider and clears the handle; no-op if never resolved.
- **`analyticsProviderProbe`** – Boot-time shape check so a typo'd provider name fails before the first request.

## Relationships

- **`./umami.ts`, `./posthog.ts`, `./none.ts`** – Provides the three `AnalyticsProvider` implementations registered at module load.
- **`@infrastructure/observability/tracer`** – Supplies `getActiveSpanContext()` so `buildAnalyticsBase` can stamp the OTel trace ID without call-site plumbing.
- **`@infrastructure/runtime/provider-registry`** – Provides `createProviderRegistry` and `requireProvider` used to build and resolve the registry.
- **`@infrastructure/config/define`** – Provides `defineConfig` and `probe` for the boot-time `analyticsProviderProbe`.
- **`@infrastructure/observability/config`** – Supplies `analyticsConfig()` (consent requirement, default provider name).
- **`src/app/config.ts`** – Wires `analyticsProviderProbe` into the application boot sequence (referenced in JSDoc).
- **`src/infrastructure/runtime/server-lifecycle.ts`** – Calls `shutdownAnalytics()` last in the shutdown chain to flush buffered events.
- **Module services** (`account/services/signup.ts`, `logout.ts`, `oauth.ts`, `profile.ts`, `self-delete.ts`, etc.) – Consume `buildAnalyticsBase` + `emitAnalyticsEvent` to record their product events; each also declares its events by augmenting `AnalyticsEventMap`.

## Notes

- **`timestamp` is PostHog-only.** Umami (pinned v2.14.0) stamps ingest time, so replayed/backfilled events land on the wrong date there.
- **Umami discards events lacking `userAgent`.** The field is optional on the type but effectively required when the active provider is Umami.
- **Anonymous collapse.** Unauthenticated callers all map to `distinctId: 'anonymous'`. Umami still differentiates via IP+UA hash; PostHog does not.
- **Consent is opt-in.** `NODE_ANALYTICS_REQUIRE_CONSENT` defaults to `true`; a `false` consent (or "never asked") drops the event. There is no partial-capture path.
- **`capture` is fire-and-forget by contract.** It returns `void`; a failing provider warns once then silently discards. Call sites must never `await` or `try/catch` it.
- **`shutdownAnalytics` is a no-op if the provider was never resolved**, so a typo'd `NODE_ANALYTICS_PROVIDER` won't crash the process during teardown.
