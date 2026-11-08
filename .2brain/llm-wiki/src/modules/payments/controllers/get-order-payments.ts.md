---
source: src/modules/payments/controllers/get-order-payments.ts
sha256: 27dc73a699de28284af82ca9d7bcfcead72826c727d6d4ec69d2e3b964182c2f
generated_at: 2026-11-08T07:16:56.726542+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-order-payments.ts

## Purpose

Handler for `GET /orders/:id/payments`. Returns the payment records (intents and their statuses) for a given order so the order-page payment panel can rehydrate on load. An order with no payment started returns `{ items: [] }`; a 404 is returned only when the caller cannot see the order (authorization failure), not when the order simply has no payments.

## Key elements

- **`getOrderPayments`** (exported) — The sole route handler. Validates the `:id` param via `requireId`, delegates to `paymentService.listForOrder(orderId, request.authContext)`, and writes either a refusal (401/403/404) or a `successResponse` with `OrderPaymentsResponse` data. Catches unexpected errors via `catchAs`.

## Relationships

- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the order ID from request params; short-circuits with a 404 (message key `orders.not-found`) when absent.
- **`src/modules/payments/services/index.ts`** — Provides `paymentService.listForOrder`, the single business-logic call this controller makes.
- **`src/infrastructure/http/response.ts`** — `successResponse` wraps the service result into the standard HTTP envelope.
- **`src/infrastructure/http/controller.ts`** — `refused` inspects the service result and writes the appropriate error status; `catchAs` maps unexpected throws to a 500.
- **`src/modules/payments/order-routes.ts`** — Registers `getOrderPayments` on the `GET /orders/:id/payments` route.
- **`src/types/index.ts`** — Exports the `OrderPaymentsResponse` type used as the generic parameter of `successResponse`.

## Notes

- The 404 semantics are intentional and slightly counter-intuitive: "no payments yet" is a 200 with an empty `items` array, not a 404. A 404 signals *the caller is not authorized to see this order*, not that the order is missing.
- `requireId` is called with a typed param `Request<{ id?: string }>`, meaning the ID is optional in the type signature; the handler relies on `requireId` to enforce presence.
