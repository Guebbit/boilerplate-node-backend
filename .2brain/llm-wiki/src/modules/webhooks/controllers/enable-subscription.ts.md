---
source: src/modules/webhooks/controllers/enable-subscription.ts
sha256: 45958972b013d05728f30b1d7d3c0dc3b43e4dc4d263cf73bd41988fe6037518
generated_at: 2026-10-29T06:25:30.937024+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/enable-subscription.ts

## Purpose

Express controller handler for `POST /webhooks/subscriptions/:id/enable`. It re-enables a previously disabled webhook subscription, validates the route ID and tenant context, delegates the state change to the webhooks service, and formats the resulting subscription object for the HTTP response.

## Key elements

- **`enableWebhookSubscription`** – The sole export. Accepts Express `Request<{ id: string }>` and `Response`. Extracts and validates the `:id` route param, builds a tenant/caller context, calls `webhooksService.enableSubscription`, then either sends a `409` (via `refused`) when the subscription is already active or returns `200` with the re-shaped subscription via `viewSubscription`. Failures are funnelled through `catchAs`.

## Relationships

- **`src/infrastructure/http/ids.ts`** – `requireId` validates and returns the `:id` param, short-circuiting with a 404 if missing.
- **`src/infrastructure/http/request.ts`** – `tenantCallerContextOf` derives the multi-tenant caller context from the request for downstream service calls.
- **`src/infrastructure/http/controller.ts`** – `refused` inspects the service result and emits a 409 when the action is not allowed; `catchAs` maps unhandled errors to an appropriate error response tagged with the handler name.
- **`src/infrastructure/http/response.ts`** – `successResponse` serialises the payload into the standard success envelope.
- **`src/modules/webhooks/services/index.ts`** – `webhooksService.enableSubscription` performs the actual state transition.
- **`src/modules/webhooks/services/actions.ts`** – `viewSubscription` projects the internal `WebhookSubscription` record into the shape returned to the caller (filters internals based on `context.caller`).
- **`src/types/index.ts`** – Provides the `WebhookSubscription` type used to type the success response.
- **`src/modules/webhooks/routes.ts`** – Registers this handler on the `POST /webhooks/subscriptions/:id/enable` route.

## Notes

- The "already enabled" case is signalled in-band through the service result (checked by `refused`) rather than by throwing, so the 409 path never hits `catchAs`.
- The JSDoc explicitly notes that this endpoint works from *either* kind of off-state (paused vs. revoked), so callers should not need to distinguish which.
- The early `return` on a missing ID leaves the `Response` object in a state already written to by `requireId`; the trailing promise chain is not reached.
