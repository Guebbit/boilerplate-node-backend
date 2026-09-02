# src/infrastructure/observability/analytics/index.ts

## Purpose

Defines the product-analytics port, event taxonomy, payload schema, provider registry, and the single emit path (`emitAnalyticsEvent`) that every module funnels through. It is explicitly distinct from metrics/tracing: it answers product questions (funnels, adoption) rather than operational ones. The active backend is a deployment choice (`NODE_ANALYTICS_PROVIDER`, default `umami`); `none` disables collection entirely.

## Key elements

- **`AnalyticsEventMap`** – Empty interface reserved for declaration merging. Each domain module (e.g. `modules/cart/analytics.ts`) augments it with its own event names; `infrastructure` never imports from a module.
- **`AnalyticsEventName`** – Resolved union of every declared event name in the build.
- **`AnalyticsEvent`** – Core payload shape: `distinctId`, `event`, optional `timestamp`, `traceId`, `properties`, `clientIp`, `userAgent`, `hostname`.
- **`AnalyticsEventInput`** – `AnalyticsEvent` plus `analyticsConsent`; consent is a gate input, not event data, so `AnalyticsProvider.capture` structurally cannot receive it.
- **`AnalyticsProvider`** (port interface) – `name`, `capture(event): void` (fire-and-forget), `configured(): boolean`, `shutdown(): Promise<void>`.
- **`resolveAnalyticsProvider()`** – Memoised lookup of the provider named by `NODE_ANALYTICS_PROVIDER` (default `umami`). Throws on unknown provider names.
- **`resetAnalyticsProvider()`** – Clears the memoised handle; test seam analogous to the mailer's `resetTransporter`.
- **`buildAnalyticsBase(context: CallerContext)`** – Populates the shared fields (`distinctId`, `traceId`, `clientIp`, `userAgent`, `hostname`, `analyticsConsent`) from a `CallerContext` so call sites don't repeat boilerplate.
- **`requireAnalyticsConsent()`** – Reads `NODE_ANALYTICS_REQUIRE_CONSENT` (default `true`); when enabled, only `'granted'` consent captures.
- **`emitAnalyticsEvent(event)`** – The single choke point. Strips consent, applies the consent gate, delegates to `resolveAnalyticsProvider().capture()`.
- **`shutdownAnalytics()`** – Flushes buffered events, releases the client, and clears the memoised handle. No-op if the provider was never resolved.

## Relationships

- **`@infrastructure/observability/tracer`** – `buildAnalyticsBase` calls `getActiveSpanContext()` to read the ambient OTel trace ID without call-site plumbing.
- **`@infrastructure/runtime/environment`** – `requireAnalyticsConsent` reads the `NODE_ANALYTICS_REQUIRE_CONSENT` flag via `environmentFlag`.
- **`@infrastructure/http/request`** – `CallerContext` (type-only import) is the input shape for `buildAnalyticsBase`.
- **`./umami`, `./posthog`, `./none`** – The three `AnalyticsProvider` implementations registered in the `PROVIDERS` map.
- **`runtime/server-lifecycle`** – Calls `shutdownAnalytics()` as the last step in the shutdown chain.
- **Domain modules (cart, account, etc.)** – Consume `emitAnalyticsEvent` / `buildAnalyticsBase` and augment `AnalyticsEventMap` via declaration merging. The cross-cutting test `tests/cross-cutting/analytics-events.test.ts` enforces 1:1 event-name sharing with the frontend.

## Notes

- **Declaration merging is the extension mechanism.** `AnalyticsEventMap` is deliberately empty here. Adding a new event requires augmenting the interface in the owning module's analytics file; the `infrastructure` layer never imports module code.
- **Consent is opt-in by default.** `requireAnalyticsConsent()` defaults to `true`, meaning an event is dropped unless the caller explicitly passes `analyticsConsent: 'granted'`. A deployment that has its own legal basis for server-side, non-cookie analytics can set `NODE_ANALYTICS_REQUIRE_CONSENT=false`.
- **`capture` is fire-and-forget.** It returns `void`; a provider failure is silent by contract. `configured()` exists so `/observability/health` can surface a misconfiguration, but `capture` itself never throws to the caller.
- **`timestamp` is PostHog-only.** Umami (pinned v2.14.0) stamps ingest time and has no timestamp field in its `/api/send` API, so replayed events land on the wrong date under Umami.
- **`userAgent` is required by Umami.** Umami discards an event that arrives without one; PostHog does not.
- **Pre-login identity.** Unauthenticated callers all get `distinctId: 'anonymous'`. Under Umami the IP + user-agent hash still separates visitors; under PostHog they do not.
- **Memoised provider handle.** `shutdownAnalytics` clears the handle after flushing so a restarted process (or a test) builds a fresh client rather than reusing a shut-down one.
