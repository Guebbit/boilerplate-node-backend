---
source: src/infrastructure/observability/analytics/index.ts
sha256: e8931019b6c931ce724cccd792b27f8d8afa0291921066e2ee19a02a339d2a0e
generated_at: 2026-10-29T02:08:10.703554+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/index.ts

## Purpose

Defines the product-analytics **port** (`AnalyticsProvider` interface), the **registry** of shipped implementations (Umami, PostHog, none), and the **emit helpers** every module calls to record an event. It answers product/funnel questions, not operational ones (that is tracing/metrics). Which backend is active is a deployment decision via `NODE_ANALYTICS_PROVIDER` (default `umami`).

## Key elements

- **`AnalyticsEventMap`** — An intentionally empty interface; modules augment it via declaration merging to declare their own event names. Prevents `infrastructure` from importing any module.
- **`AnalyticsEventName`** — Union of all declared event names across modules.
- **`AnalyticsEvent`** — Core payload shape (`distinctId`, `event`, optional `timestamp`, `traceId`, `properties`, `clientIp`, `userAgent`, `hostname`).
- **`AnalyticsEventInput`** — `AnalyticsEvent` plus the required `analyticsConsent: boolean` gate flag.
- **`AnalyticsProvider`** — The port: `capture()` (fire-and-forget), `configured()`, `forget(distinctId)` (GDPR erasure, awaited, rejects on failure), `shutdown()`.
- **`AnalyticsProviderName`** — Closed literal union: `'umami' | 'posthog' | 'none'`.
- **`resolveAnalyticsProvider()`** — Memoised, lazy lookup of the configured provider. Throws on an unrecognised `NODE_ANALYTICS_PROVIDER` value.
- **`resetAnalyticsProvider()`** — Test seam to clear the memoised handle.
- **`buildAnalyticsBase(context)`** — Populates `distinctId`, `traceId` (from ambient OTel span), `clientIp`, `userAgent`, `hostname`, and `analyticsConsent` from a `CallerContext`.
- **`emitAnalyticsEvent(event)`** — The single choke point: gates on `NODE_ANALYTICS_REQUIRE_CONSENT` + the event's consent flag, then delegates to `provider.capture()`. Returns `void`.
- **`shutdownAnalytics()`** — Flushes and releases the provider; called during server shutdown. No-op if no provider was ever resolved.
- **`analyticsProviderProbe`** — A `defineProbe` that eagerly resolves the provider at boot so a typo in the env var fails before the first request.

## Relationships

- **`provider-registry.ts`** — Supplies `createProviderRegistry` and `requireProvider`; this file is a consumer of that generic mechanism.
- **`config/define.ts`** — Supplies `defineProbe`, used to create `analyticsProviderProbe`.
- **`observability/config.ts`** — Supplies `analyticsConfig()` which reads `NODE_ANALYTICS_PROVIDER` and `NODE_ANALYTICS_REQUIRE_CONSENT`.
- **`observability/tracer.ts`** — `buildAnalyticsBase` calls `getActiveSpanContext()` to attach the OTel trace ID without per-call-site plumbing.
- **`umami.ts` / `posthog.ts` / `none.ts`** — The three `AnalyticsProvider` implementations registered in the local `registry` constant.
- **`app/config.ts`** — Wires `analyticsProviderProbe` into the boot sequence so the provider is validated before traffic.
- **`runtime/server-lifecycle.ts`** — Calls `shutdownAnalytics()` as part of the shutdown chain.
- **Module files (e.g. `modules/account/*`)** — Augment `AnalyticsEventMap` with their own event names and call `emitAnalyticsEvent` / `buildAnalyticsBase`. `account-deletion` is the expected caller of `provider.forget()` for GDPR erasure.

## Notes

- **Consent is opt-in by default** (`NODE_ANALYTICS_REQUIRE_CONSENT` defaults to `true`). A deployment can set it to `false` with its own legal justification, but the codebase ships the restrictive default (GDPR Art. 25(2)).
- **`capture` is fire-and-forget by contract**; `forget` is the opposite — it rejects on failure so the outbox relay can retry and park a dead erasure. Do not swallow `forget` errors.
- **`timestamp` is PostHog-only.** Umami's `/api/send` endpoint (v2.14.0) has no timestamp field and stamps ingest time, so replayed events land on the wrong date there.
- **`userAgent` is critical under Umami** — it discards an event that arrives without one. Under PostHog it is optional for visitor splitting.
- **`distinctId` collapses to `'anonymous'`** for unauthenticated callers. Under Umami the IP + user-agent hash still separates visitors; under PostHog it does not.
- **The provider handle is module-level mutable state** (`let provider`). `resetAnalyticsProvider` and `shutdownAnalytics` both clear it. Tests that vary the env var between cases must call the reset.
- **Adding a new provider** requires one adapter file implementing `AnalyticsProvider` and one entry in the `registry` object. No other wiring is needed.
