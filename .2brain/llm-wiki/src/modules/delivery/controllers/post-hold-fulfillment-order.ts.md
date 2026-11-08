---
source: src/modules/delivery/controllers/post-hold-fulfillment-order.ts
sha256: 5c406d4943a3a48d646b3d4b0e60ba13d348aa0ed59e4db18f6201f04e60f10f
generated_at: 2026-11-08T05:27:30.872276+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-hold-fulfillment-order.ts

## Purpose

Express route handlers for holding and releasing a fulfillment order (`POST /delivery/fulfillment-orders/:id/hold` and `…/release`). They validate the request, delegate to the delivery service, and shape the HTTP response.

## Key elements

- **`postHoldFulfillmentOrder`** — Validates the `:id` route param and the JSON body (via `HoldFulfillmentOrderBody` Zod schema), then calls `deliveryService.holdFulfillmentOrder`. Responds with the updated `FulfillmentOrder` or a refusal/error.
- **`postReleaseFulfillmentOrder`** — Validates the `:id` route param (no body required), then calls `deliveryService.releaseFulfillmentOrder`. Responds with the updated `FulfillmentOrder` or a refusal/error.

Both handlers are plain Express `(request, response) => Promise<void>` functions; they are not classes or middleware factories.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (unified error-to-HTTP mapping), `parseBody` (Zod body validation), and `refused` (result-shape guard for domain-level rejections).
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `:id` route parameter, short-circuiting with a 404 if absent.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts caller metadata from the request for service-level audit/authorization.
- **`src/infrastructure/http/response.ts`** — `successResponse` serializes the domain result into a standard 2xx JSON envelope.
- **`src/modules/delivery/routes.ts`** — Imports these two handlers and wires them to their `POST` routes.
- **`src/modules/delivery/services/index.ts`** — Exports `deliveryService`, the domain service that performs the actual hold/release logic.
- **`src/types/index.ts`** — Supplies the `FulfillmentOrder` type used in response generics.

## Notes

- The `hold` handler requires a parsed body (`HoldFulfillmentOrderBody`); the `release` handler does **not** read a body at all.
- Both handlers call `request.authContext` (typed outside the generic param) rather than the standard `request.user`/`request.auth` — this convention comes from the project's auth middleware and is passed straight through to the service.
- Early-return pattern: when `requireId` or `parseBody` fail they already sent an error response; the handler returns `Promise.resolve()` to satisfy the `Promise<void>` signature without double-responsing.
- The `notFound` i18n key is `'delivery.fulfillment-order-not-found'`; keep it in sync with the translation catalog if the message text changes.
