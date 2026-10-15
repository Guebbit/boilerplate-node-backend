---
source: src/modules/webhooks/controllers/update-subscription.ts
sha256: c7e4e84dc12c649400b57e8f2bb08661aafac2e0843a9861e74396f60043636d
generated_at: 2026-10-15T12:18:41.588914+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/update-subscription.ts

## Purpose

Builds the `PUT /webhooks/subscriptions/:id` (full replace) and `PATCH /webhooks/subscriptions/:id` (partial merge) HTTP handlers from a shared `createUpdateController` factory. Both verbs delegate to the same service method but accept different request schemas. This file intentionally does **not** manage subscription secrets — that lives on dedicated action routes.

## Key elements

- **`replaceWebhookSubscription`** – `PUT` handler. Validates the body against `ReplaceWebhookSubscriptionBody`, then calls `webhooksService.updateSubscription` with the full change set.
- **`updateWebhookSubscription`** – `PATCH` handler. Validates against `UpdateWebhookSubscriptionBody` (partial/merge semantics), same service call.
- Both are produced in one destructuring of `createUpdateController({ … })` with `versioned: false` and `entity: 'webhookSubscription'`.
- `tenantCallerContextOf(request)` extracts the tenant scope from the incoming request and passes it as the third argument to the service call.
- `presentWebhookSubscription(subscription)` shapes the response body before it is sent back.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** – Supplies the `createUpdateController` factory that this module invokes to wire up the two HTTP verbs, not-found handling, and schema validation in a single call.
- **`src/infrastructure/http/request.ts`** – Provides `tenantCallerContextOf`, used to derive the tenant-scoped caller context passed into the service layer.
- **`src/modules/webhooks/services/index.ts`** – Exports `webhooksService`, whose `updateSubscription` method performs the actual persistence for both verbs.
- **`src/modules/webhooks/presenters.ts`** – Exports `presentWebhookSubscription`, the serializer the controller uses to format the response.
- **`src/modules/webhooks/routes.ts`** – Registers `replaceWebhookSubscription` and `updateWebhookSubscription` as the handlers for the corresponding route paths.

## Notes

- The module doc-comment explicitly calls out that neither PUT nor PATCH touches the secret ring; secret rotation/removal are separate action routes (`rotate-subscription-secret.ts` / `remove-subscription-secret.ts`). Don't add secret mutations here.
- `versioned: false` means the factory does not prepend or check a version prefix on the entity key — the endpoint path is unversioned.
- Despite sharing one service method, the two verbs enforce **different** Zod schemas (`Replace…` vs `Update…`), so PUT requires all fields while PATCH accepts a subset.
