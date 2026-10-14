---
source: src/modules/delivery/controllers/get-order-fulfillment.ts
sha256: 69ae10b50ca6b69421a831ffc32eeb7199c70c452866609ca00e9845f9aca09e
generated_at: 2026-10-14T15:20:03.835143+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-order-fulfillment.ts

## Purpose

HTTP controller for `GET /delivery/order/:orderId`. Returns the fulfillment orders and their shipments for a given order. Consumed by the order page's shipping panel after the order has been paid; before payment both lists are empty.

## Key elements

- **`getOrderFulfillment`** (exported) — Request handler. Validates the `orderId` route param, calls `deliveryService.getForOrder`, then either short-circuits on refusal, sends a `successResponse` with `OrderFulfillment` data, or delegates to `catchAs` for error serialization.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` (error → response helper) and `refused` (checks for a refusal result and short-circuits the handler).
- **`src/infrastructure/http/ids.ts`** — Imports `requireId`, which extracts and validates the `orderId` param, returning early (with a `notFound` message) if absent or invalid.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse`, the generic wrapper that serializes a successful payload.
- **`src/modules/delivery/routes.ts`** — Registers `getOrderFulfillment` on the `GET /delivery/order/:orderId` route.
- **`src/modules/delivery/services/index.ts`** — Imports `deliveryService`; the handler delegates all business logic to `deliveryService.getForOrder(orderId, authContext)`.
- **`src/types/index.ts`** — Imports the `OrderFulfillment` type used as the response payload shape.

## Notes

- The handler is a plain arrow function (not a class method) and returns a `Promise<void>`; the early-exit path after a failed `requireId` returns `Promise.resolve()` rather than `undefined` to satisfy the signature.
- `requireId` is called with `notFound: 'delivery.order-not-found'` and `name: 'orderId'` — the i18n key and param name are declared here, not in a shared config.
- The doc comment states the endpoint is expected to return empty lists pre-payment, but no guard for that is visible in this file; the empty state is presumably handled inside `deliveryService.getForOrder`.
