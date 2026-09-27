---
source: src/modules/orders/controllers/create-order.ts
sha256: 5b3d96f305dcd6f81f0699f4746eae25a88e75608297e06a13496d52ba4c857e
generated_at: 2026-09-27T15:07:08.190554+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/create-order.ts

## Purpose

HTTP handler for `POST /orders`. This is the **admin** order-creation path: it accepts an explicit `items` array directly from the request body, bypassing the cart/checkout flow found in `@modules/cart`. It validates the payload, delegates to `orderService.create`, and returns a `201` response.

## Key elements

- **`createOrder`** (exported const) — The sole export. Accepts an Express `Request<unknown, unknown, CreateOrderRequest>` and `Response`. Validates the body against the Zod schema `CreateOrderBody`, then calls `orderService.create(userId, email, items, callerContextOf(request))`. On success increments `orderCreatedTotal` and delegates the HTTP response to `respondWithOrder`. On failure routes to `rejectValidation` or `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — Imports `catchAs`, `refused`, `rejectValidation` for structured error/refusal handling and response short-circuiting.
- **`@infrastructure/http/request`** — Imports `callerContextOf` to extract locale/auth metadata from the request and pass it into the service layer.
- **`@modules/orders/controllers/respond.ts`** — Imports `respondWithOrder` to build the final `201` JSON response.
- **`@modules/orders/metrics.ts`** — Imports `orderCreatedTotal` (a Prometheus counter) and increments it after a successful creation.
- **`@modules/orders/routes.ts`** — Registers `createOrder` as the handler for `POST /orders`.
- **`@modules/orders/services/index.ts`** — Imports `orderService` and calls its `.create` method (the actual business logic).
- **`@types`** — Imports the `CreateOrderRequest` type used to type the Express request body.

## Notes

- The confirmation email is sent **inside** `orderService.create`, not here. The comment makes explicit that it is "a fact about the order, not about the request that asked for one," and is locale-aware via `CallerContext.locale`.
- Validation is done locally with `CreateOrderBody.safeParse` rather than relying on upstream middleware; a failed parse immediately `return Promise.resolve()`s after `rejectValidation`, so the service is never called.
- The handler returns `Promise<void>` in all paths (success, refusal, validation error, catch), which matters if the route layer awaits it.
