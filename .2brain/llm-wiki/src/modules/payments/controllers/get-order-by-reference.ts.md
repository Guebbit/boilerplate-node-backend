---
source: src/modules/payments/controllers/get-order-by-reference.ts
sha256: b2927fcedcc56a06e8e7eb07be67eac1e1a73260c353f89c6e539c55443fa886
generated_at: 2026-09-23T19:16:40.592433+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-order-by-reference.ts

## Purpose

Handler for `GET /payments/order-by-reference`. Given an RF reference code (read from a bank's website), it resolves the corresponding order and returns it with the caller's available next actions. It exists as the read step an admin performs before recording an offline payment via `POST /payments/order/:orderId/offline`.

## Key elements

- **`getOrderByReference`** (exported) — Express handler that validates the `ref` query param, calls `paymentService.getOrderByReference(ref)`, then enriches the result through `orderService.withActions(result.data, request.authContext)` before responding.
- **`GetOrderByReferenceQueryParams`** (zod schema, imported from `@api/schemas.zod`) — bounds the shape and length of `ref` so bad input returns 422 instead of propagating to the mod-97 lookup and surfacing as a 404.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, `refused`, and `rejectValidation` used for unified error/refusal/validation responses.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the 200 reply.
- **`src/modules/payments/services/index.ts`** — exports `paymentService`, whose `getOrderByReference` performs the actual lookup.
- **`src/modules/orders/index.ts`** / **`src/modules/orders/services/index.ts`** — exports `orderService`, whose `withActions` resolves line-item images and computes the caller's permitted actions (refund, cancel, etc.) on the order.
- **`src/modules/payments/routes.ts`** — mounts this handler at the `GET /payments/order-by-reference` path.
- **`src/types/index.ts`** — source of the `Order` type used in the response generic.

## Notes

- The handler deliberately validates `ref` with a zod schema *before* touching the service layer so that a missing or oversized reference yields a 422 rather than a misleading 404 from the downstream mod-97 check.
- `withActions` is not optional decoration here: the entire use-case is to surface the admin's next moves (refund/cancel) alongside the order data, so the response always carries that context.
- The file doc-comment explicitly equates the authority of this read with the offline-payment write; there is no separate permission gate between them.
