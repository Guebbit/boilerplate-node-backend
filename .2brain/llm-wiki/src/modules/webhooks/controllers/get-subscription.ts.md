---
source: src/modules/webhooks/controllers/get-subscription.ts
sha256: 5f0fd758554264940bc488117baf62a28eaaa589c71cead4c7beee4d7bb961b7
generated_at: 2026-10-29T06:25:44.638044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/get-subscription.ts

## Purpose

Single-purpose controller for `GET /webhooks/subscriptions/:id`. It retrieves one webhook subscription belonging to the caller's tenant, returning 404 for both a missing ID and an ID owned by a different shop.

## Key elements

- **`getWebhookSubscription`** (exported const) — The controller, built by the `createItemController` factory with:
  - `entity: 'webhookSubscription'`
  - `notFoundKey: 'generic.error-item-gone'`
  - `fetch` — delegates to `webhooksService.getSubscription(id, tenantCallerContextOf(request))`

## Relationships

- **`@infrastructure/http/request`** — `tenantCallerContextOf` extracts the caller's tenant identity from the HTTP request and passes it into the service call.
- **`@infrastructure/surfaces/create-item-controller`** — Factory that wraps the `fetch` callback into a standard item-controller (handles routing, error mapping, 404 response shape).
- **`../services/index`** — `webhooksService.getSubscription` performs the actual lookup; it receives the ID and tenant context.
- **`../routes`** — Registers `getWebhookSubscription` on the `GET /webhooks/subscriptions/:id` route.

## Notes

- Tenant isolation is enforced at the service layer: passing a foreign shop's ID yields 404, not 403, so the endpoint does not leak existence of other tenants' subscriptions.
- The controller itself contains no branching logic—all error handling (404, i18n key) is delegated to `createItemController`.
