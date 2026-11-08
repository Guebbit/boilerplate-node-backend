---
source: src/modules/analytics/openapi.yaml
sha256: f2fef3ecf5bb6f642cf0b272588c2139a58704d0733689e46f64c88dc4fabcbd
generated_at: 2026-11-08T04:59:02.040901+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the analytics module's single browser-facing endpoint. It defines what events a browser may report, the consent semantics around them, and the module's error surface, serving as the canonical API description for both the implementation (`module.ts`) and any client tooling.

## Key elements

- **`POST /analytics/events`** (`createAnalyticsEvent`) — Accepts one browsing event from a browser. Returns `204` unconditionally (recorded or not, depending on consent); `401`, `422`, `429` for auth/validation/rate-limit failures. No `200` body is ever returned.
- **`AnalyticsEventRequest` schema** — Minimal placeholder: requires an `event` string (max 100 chars) and allows `additionalProperties`. The actual closed set of event shapes (`product_viewed`, `products_searched`) is injected at build time by `scripts/contracts/analytics-browser-events.ts`, which replaces this object with a `oneOf` over the per-module browser-event schemas.
- **`tags: Analytics`** — Tagged with `x-family: Core`; scopes the module's operations and carries the descriptive blurb about consent-gated browsing events.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — The spec `$ref`s three shared responses (`Unauthorized`, `ValidationError`, `TooManyRequests`) from this file rather than redefining them, keeping error semantics consistent across modules.
- **`src/modules/analytics/module.ts`** — The runtime implementation of the `createAnalyticsEvent` operation. This YAML is its declarative contract; the module must satisfy the request/response shapes and status codes defined here.

## Notes

- The event set is intentionally **closed and browser-side only**. Business-fact events (cart, checkout, order, payment, signup, login) are explicitly excluded; they are emitted by the service that makes them true, not through this relay.
- The `AnalyticsEventRequest` schema in this file is a **build-time placeholder**. Its `additionalProperties: true` and single `event` property are the "no module declares one" fallback. The real shape is the `oneOf` produced by the bundler script, so reading this file alone will understate what the API actually accepts.
- Consent is handled **server-side invisibly**: a non-consenting visitor still receives `204`, and the response gives no signal whether the event was recorded. Callers should not gate the call on consent state they observe client-side.
- The relative `$ref` paths reach three directories up (`../../../shared/…`), so moving this file without updating those paths will break spec resolution.
