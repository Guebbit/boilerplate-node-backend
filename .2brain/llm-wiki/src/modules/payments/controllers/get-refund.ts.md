---
source: src/modules/payments/controllers/get-refund.ts
sha256: 40b42389a288c934f4c467aafb23fd495cb698245de315542879af98cd55eeb6
generated_at: 2026-11-08T07:17:37.050482+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-refund.ts

## Purpose

Handler for `GET /payments/:id/refunds/:refundId`. Returns a single refund record addressed through its parent payment (the read counterpart to `POST /payments/:id/refunds`). Delegates all data access to the payment service and translates the result into an HTTP response.

## Key elements

- **`getRefund`** (default export) — Express handler. Validates both route params, calls `paymentService.getRefund`, then either rejects (via `refused`) or sends the `Refund` payload (via `successResponse`). Errors are funnelled through `catchAs(response, 'getRefund')`.

## Relationships

- **`src/modules/payments/services/index.ts`** — calls `paymentService.getRefund(paymentId, refundId, authContext)`; the sole source of refund data and authorization logic.
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates both `id` and `refundId` from the route, short-circuiting with a 404 when either is missing.
- **`src/infrastructure/http/response.ts`** — `successResponse` shapes the 200 JSON body.
- **`src/infrastructure/http/controller.ts`** — `refused` detects a denied result (e.g. 403) and writes the error response; `catchAs` serialises thrown errors into a structured error response.
- **`src/modules/payments/routes.ts`** — registers `getRefund` on the `GET /payments/:id/refunds/:refundId` route.
- **`src/types/index.ts`** — imports the `Refund` type used as the generic on `successResponse`.

## Notes

- An invalid or missing `refundId` returns the **same** 404 body as a missing `paymentId` (`payments.not-found`). This is intentional: a refund is only addressable through its payment, so no separate "refund not found" message exists.
- Early-exit paths return `Promise.resolve()` (a resolved Promise) rather than a plain `return;`, keeping the handler's return type uniformly `Promise<void>`.
- Route param types are declared as optional (`id?: string; refundId?: string`); the actual "required" check is performed at runtime by `requireId`, not by the type system.
