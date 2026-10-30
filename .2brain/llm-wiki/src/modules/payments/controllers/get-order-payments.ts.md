---
source: src/modules/payments/controllers/get-order-payments.ts
sha256: 27dc73a699de28284af82ca9d7bcfcead72826c727d6d4ec69d2e3b964182c2f
generated_at: 2026-10-29T05:02:17.165728+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-order-payments.ts

## Purpose

HTTP handler for `GET /orders/:id/payments`. Serves the payment panel on the order page so that a mid-flow reload recovers the payment intent and its current status rather than forcing the caller to start over. Returns an empty `items` array for orders with no payment activity; reserves 404 for orders the caller genuinely cannot see.

## Key elements

- **`getOrderPayments`** (exported function) — The sole route handler. Extracts and validates `:id`, delegates to `paymentService.listForOrder`, then shapes the HTTP response (success, refusal, or error).
- **`requireId`** (imported) — Validates the `:id` param; short-circuits with a 404 (`orders.not-found`) if missing.
- **`refused`** (imported) — Checks the service result for an authorization/refusal signal and emits the appropriate 4xx without throwing.
- **`successResponse<OrderPaymentsResponse>`** (imported) — Serialises the service payload into the standard success envelope.
- **`catchAs`** (imported) — Catches unexpected errors and maps them to a consistent error response tagged with the handler name `'getOrderPayments'`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Source of `catchAs` and `refused`; provides the shared error-handling and refusal-detection contract for all controllers.
- **`src/infrastructure/http/ids.ts`** — Source of `requireId`; standardises param extraction and the "not found" short-circuit.
- **`src/infrastructure/http/response.ts`** — Source of `successResponse`; enforces the uniform `{ data }` response shape.
- **`src/modules/payments/order-routes.ts`** — The route table that registers `getOrderPayments` against the `GET /orders/:id/payments` path.
- **`src/modules/payments/services/index.ts`** — Exposes `paymentService`; this controller calls `paymentService.listForOrder(orderId, authContext)`.
- **`src/types/index.ts`** — Defines `OrderPaymentsResponse`, the typed shape of the payload returned to the client.

## Notes

- An order with no payments is **not** an error — it returns `200` with `{ items: [] }`. Only visibility/authorization failures produce 404/403.
- The handler is a plain function (not a class method) and uses the project's promise-chain style (`.then`/`.catch`) rather than `async/await`.
- `request.authContext` is passed straight through to the service; this controller performs no authorisation logic of its own.
