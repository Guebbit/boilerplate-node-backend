---
source: src/modules/webhooks/controllers/get-subscription.ts
sha256: 5f0fd758554264940bc488117baf62a28eaaa589c71cead4c7beee4d7bb961b7
generated_at: 2026-11-08T09:01:09.263217+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/get-subscription.ts

## Purpose

Defines the single GET-by-ID handler for webhook subscriptions (`GET /webhooks/subscriptions/:id`). It is a thin wrapper that delegates to the webhooks service while enforcing tenant isolation at the HTTP surface.

## Key elements

- **`getWebhookSubscription`** (export) – The route handler produced by `createItemController`. Accepts `{ entity, notFoundKey, fetch }` config:
  - `entity: 'webhookSubscription'` – identifies the resource type for the framework's item-routing conventions.
  - `notFoundKey: 'generic.error-item-gone'` – i18n key returned on 404.
  - `fetch(id, request)` – calls `webhooksService.getSubscription(id, tenantCallerContextOf(request))`.

## Relationships

- **`src/infrastructure/http/request.ts`** – Supplies `tenantCallerContextOf`, which extracts the tenant/caller context from the incoming request and passes it as the second argument to the service call.
- **`src/infrastructure/surfaces/create-item-controller.ts`** – Factory used to build the controller. It handles parameter extraction, the 404 response shape, and any cross-cutting concerns around item retrieval.
- **`src/modules/webhooks/services/index.ts`** – Exposes `webhooksService.getSubscription`, the actual data-access method that looks up the subscription row.
- **`src/modules/webhooks/routes.ts`** – The route table that mounts `getWebhookSubscription` on the `GET /webhooks/subscriptions/:id` path.

## Notes

- A missing ID **and** an ID belonging to another tenant both return **404** (not 403). This is deliberate: it avoids leaking the existence of another shop's subscription.
- The `notFoundKey` is a *generic* key (`generic.error-item-gone`), not a webhooks-specific one, so the error body is indistinguishable from other item-gone cases.
