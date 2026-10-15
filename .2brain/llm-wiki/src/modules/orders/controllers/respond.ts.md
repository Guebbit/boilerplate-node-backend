---
source: src/modules/orders/controllers/respond.ts
sha256: 16c3573a286231de369098cf70e8430ba1c6d550a18cf07603ef3456ebe0ec36
generated_at: 2026-10-15T11:00:28.729405+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/respond.ts

## Purpose

Shared success-tail helper for every order controller (writes and the single-order read). It hydrates the order document returned by the service with the caller's `actions` via `orderService.withActions`, then sends it as the HTTP success envelope. Kept separate from `services/scope.ts` so that `withActions` remains framework-free; each call site still declares its own status code and message.

## Key elements

- **`OrderForResponse`** (type, not exported) — Derived from `Parameters<typeof orderService.withActions>[0]` rather than imported from the model layer, enforcing the `no-persistence-imports` boundary for controllers.
- **`respondWithOrder`** (exported const, the only export) — Accepts `(response, order, authContext, context, status?, message?)`. Calls `orderService.withActions`, then sends via `createdOrOk`. Attaches its own `.catch(catchAs(response, context))` so a `withActions` failure logs under the same operation name as the caller's outer `.catch`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, which wraps the `.catch` handler.
- **`src/infrastructure/http/response.ts`** — Supplies `createdOrOk`, the function that writes the success envelope (status, body, optional Location for 201).
- **`src/modules/orders/services/index.ts`** — Supplies `orderService.withActions`, the hydration step this file orchestrates.
- **`src/types/auth-context.ts`** / **`src/types/index.ts`** — Provide the `AuthContext` and `Order` types used in signatures.
- **`src/modules/orders/controllers/create-order.ts`**, **`post-cancel-order.ts`**, **`get-order-item.ts`**, **`post-order-status-override.ts`** — Callers of `respondWithOrder`; each passes its own `status` (e.g. 201 for create), `message`, and `context` string.

## Notes

- The `context` parameter is **not** optional and must match the string the calling controller already passes to its own outer `.catch`; this is intentional so a `withActions` failure and the preceding service call both log under one operation name rather than two.
- A 201 response always includes a `Location: /orders/{id}` header (RFC 9110 §9.3.3); `createdOrOk` handles this based on the `status` argument.
- This file deliberately does **not** import from the order model/persistence layer. If you need a field from the order that isn't in `OrderForResponse`, the fix belongs upstream in the service return shape, not here.
