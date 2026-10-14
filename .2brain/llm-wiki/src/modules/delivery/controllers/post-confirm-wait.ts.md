---
source: src/modules/delivery/controllers/post-confirm-wait.ts
sha256: c59d64fe95f2f915b8fbf837ad8a3adc12d39d111a4c750015f9476535f4d435
generated_at: 2026-10-14T15:20:43.952171+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-confirm-wait.ts

## Purpose

Express controller handler for `POST /delivery/fulfillment-orders/:id/confirm-wait`. It lets a buyer acknowledge a late preorder and explicitly choose to keep waiting, delegating the actual state change to the delivery service.

## Key elements

- **`postConfirmWait`** (exported) — Express handler. Validates the `:id` route param, requires an `authContext`, calls `deliveryService.confirmWait`, and either sends a `FulfillmentOrder` success response or a refusal response.

## Relationships

- **`@infrastructure/http/controller`** — imports `catchAs` (uniform error-to-HTTP mapping) and `refused` (checks whether the service result is a rejection and sends the appropriate response).
- **`@infrastructure/http/ids`** — imports `requireId` to extract and validate the `:id` param, returning a 404 with the key `delivery.fulfillment-order-not-found` when absent.
- **`@infrastructure/http/request`** — imports `callerContextOf` to derive the caller's context from the request, passed into the service call.
- **`@infrastructure/http/response`** — imports `successResponse` to serialize a `FulfillmentOrder` payload on success.
- **`../services`** — imports `deliveryService` and calls its `confirmWait(id, authContext, callerContext)` method.
- **`@types`** — imports the `FulfillmentOrder` type used in the success response generic.
- **`src/modules/delivery/routes.ts`** — wires this handler to the `POST /delivery/fulfillment-orders/:id/confirm-wait` route (inferred from the module docblock).

## Notes

- The guard `if (!id || !request.authContext) return Promise.resolve()` silently exits with **no HTTP response** if `authContext` is missing. This relies on an upstream middleware guaranteeing auth; without it the client would hang.
- `refused(response, result)` is called *after* the service resolves. If the result is a refusal, the response is already sent by that helper, so the success branch is skipped.
- Error handling is entirely delegated to `catchAs(response, 'postConfirmWait')` — no try/catch in the handler body.
