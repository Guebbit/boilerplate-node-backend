---
source: src/modules/orders/controllers/get-order-item.ts
sha256: fe8d481fd80c2f5c528b9e332ed8f4ab5a70256d9dfceaa799e5a40725423628
generated_at: 2026-09-23T19:00:27.475462+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-order-item.ts

## Purpose

Handler for `GET /orders/:id`. Returns a single order scoped to the caller's role (admins see any order; others see only their own) and augments the payload with the actions that caller is allowed to perform. It validates the `:id` parameter **before** issuing the query so that a malformed id always yields **404**, regardless of which role branch the service would have taken.

## Key elements

- **`getOrderItem`** (exported controller function) — Receives Express `Request<{ id?: string }>` and `Response`.
    1. Calls `isValidObjectId(request.params.id)`; on failure responds **404** immediately.
    2. Delegates to `orderService.getById(id, orderService.callerScope(authContext))`.
    3. If the order is `null`, responds **404**.
    4. Otherwise calls `orderService.withActions(order, authContext)` to attach role-specific actions, then sends via `successResponse<Order>`.
    5. Catches any thrown error with `catchAs(response, 'getOrderItem')`.

## Relationships

- **`src/modules/orders/routes.ts`** — Registers `getOrderItem` as the handler for the `GET /orders/:id` route.
- **`src/modules/orders/services/index.ts`** — Supplies `orderService` with the three methods this controller calls: `getById`, `callerScope`, and `withActions`.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` for all HTTP output.
- **`src/infrastructure/http/request.ts`** — Provides `isValidObjectId` used for the pre-query id check.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` for unified error serialization in the `.catch` branch.
- **`src/infrastructure/i18n/index.ts`** — Exports the `t` function used to look up the `orders.not-found` message.
- **`src/infrastructure/i18n/context.ts`** — Underlying context that `t` resolves against at runtime.
- **`src/types/index.ts`** — Source of the `Order` type used as the generic parameter of `successResponse<Order>`.

## Notes

- **Why the id is validated before the query:** The admin branch (`findById`) throws a Mongoose `CastError` while the scoped branch (aggregate with `$expr`) throws a `BSONError` (mapped to **422**) for the same malformed id. Validating first guarantees a **404** in both cases. Other single-item reads in the codebase skip this and let the query fail, mapping the error in `.catch` — this file deliberately does not.
- **Action-aware payload:** The response body is not the raw order document; it is the result of `withActions`, which embeds the set of operations the _current_ caller may perform. Clients should render UI controls from this field rather than duplicating lifecycle logic client-side.
- **Synchronous early-return:** When the id is invalid the function returns `void` (not a `Promise`), which is safe because Express does not await the return value, but it means the return type is `Promise<void> | void`.
