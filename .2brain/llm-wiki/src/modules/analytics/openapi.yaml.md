---
source: src/modules/analytics/openapi.yaml
source_sha256: f2fef3ecf5bb6f642cf0b272588c2139a58704d0733689e46f64c88dc4fabcbd
context_sha256: 1bf594deb0973a57b5c313b0bf968abf0fc7823a44ab028a91f07e31e5645a95
generated_at: 2026-11-22T04:18:07.487723+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/analytics/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract (v0.1.0) for the analytics module. It declares a single endpoint through which a browser relays browsing events that the server cannot see, because the response cache answers most reads without reaching the application.

## Key elements
- **Tag `Analytics`** (`x-family: Core`): groups the module's operations, described as browsing events reported by a browser, relayed only after visitor consent.
- **`POST /analytics/events`** (`createAnalyticsEvent`): reports one browsing event.
  - Security is optional: either anonymous (`{}`) or `bearerAuth`.
  - Request body is required JSON, validated against `AnalyticsEventRequest`.
  - `204`: accepted. The response is the same whether or not the event was recorded, so consent state is not revealed.
  - `401`, `422`, `429`: `$ref`s to shared `Unauthorized`, `ValidationError` and `TooManyRequests` responses defined outside this module.
- **`AnalyticsEventRequest`** schema: an object that requires `event` (string, max 100 chars) and allows additional properties.

## Relationships
- `src/modules/account/asyncapi.domain-events.yaml` is a graph neighbor, but this file shows no direct reference to it. The comments say business facts (signup, login, and so on) are emitted by the service that makes them true, not accepted here.

## Notes
- The accepted event set is closed. Today it is `product_viewed` and `products_searched`. Business facts (cart, checkout, order, payment, signup, login) are never accepted by this endpoint.
- A visitor who has not agreed to analytics gets the same `204`, and nothing is recorded or forwarded. Pages should not call the endpoint before the visitor has agreed.
- Per the schema comments, other modules declare the events they own in separate browser-event contract files, and a bundler step replaces `AnalyticsEventRequest` with a `oneOf` over those schemas. The schema as written is a placeholder: with no module declaring an event, it stays as an `event` name the relay recognises nothing for. The shipped contract therefore differs from this source.
