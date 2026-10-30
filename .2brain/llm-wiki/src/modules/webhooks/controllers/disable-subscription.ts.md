---
source: src/modules/webhooks/controllers/disable-subscription.ts
sha256: 0b65fe7163f1b6a7553bfaded81c78e7d25786cccc53aede8b18e0e2131e3c72
generated_at: 2026-10-29T06:25:19.818094+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/disable-subscription.ts

## Purpose

Controller handler for `POST /webhooks/subscriptions/:id/disable`. It validates the subscription ID, delegates to the webhooks service to pause the subscription, and returns the updated subscription (or a 409 if it was already paused).

## Key elements

- **`disableWebhookSubscription`** (exported function) — Express handler that extracts the ID from the route params, builds a tenant caller context, calls `webhooksService.disableSubscription(id, context)`, and responds with either the subscription view or a refusal/409.

## Relationships

- **`@infrastructure/http/ids`** — `requireId` extracts and validates the `:id` route param; short-circuits with a 404 (`generic.error-item-gone`) when absent or malformed.
- **`@infrastructure/http/request`** — `tenantCallerContextOf` builds the caller/tenant context passed into the service call and used for response shaping.
- **`@infrastructure/http/response`** — `successResponse` serialises the final `WebhookSubscription` payload.
- **`@infrastructure/http/controller`** — `refused` checks the service result for a refusal (409) and handles the write; `catchAs` wraps unexpected errors into a standard error response.
- **`../services`** (`services/index.ts`) — `webhooksService.disableSubscription` performs the actual state transition.
- **`../services/actions`** — `viewSubscription` projects the internal entity into the wire representation for the given caller.
- **`@types`** — `WebhookSubscription` type used for the response payload.
- **`src/modules/webhooks/routes.ts`** — registers this handler on the `POST /webhooks/subscriptions/:id/disable` route.

## Notes

- The 409 "already paused" path is handled by the service layer returning a refusal result; the controller never checks status codes itself.
- `viewSubscription` is a presentation-layer projection (caller-aware), so the raw service entity is never sent directly to the client.
- The `notFound` message is the generic `generic.error-item-gone` code, not a domain-specific message — keep this consistent with other ID-extraction sites if you add sibling endpoints.
