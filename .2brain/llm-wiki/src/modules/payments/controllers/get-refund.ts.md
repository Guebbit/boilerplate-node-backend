---
source: src/modules/payments/controllers/get-refund.ts
sha256: 40b42389a288c934f4c467aafb23fd495cb698245de315542879af98cd55eeb6
generated_at: 2026-10-29T05:02:45.691052+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-refund.ts

## Purpose

Handler for `GET /payments/:id/refunds/:refundId`. It resolves a single refund record that is always addressed through its parent payment (the same target a `Location` header points to after creating a refund via `POST /payments/:id/refunds`). The controller performs ID validation, delegates the fetch to the payments service, and shapes the HTTP response.

## Key elements

- **`getRefund(request, response)`** – The sole export. Validates `id` and `refundId` via `requireId`, calls `paymentService.getRefund(paymentId, refundId, request.authContext)`, then returns `successResponse<Refund>` on success or short-circuits on `refused` / error.
- **`refused` check** – Intercepts a service-level denial (e.g. insufficient permissions) and writes the appropriate HTTP status before any success path runs.
- **`catchAs(response, 'getRefund')`** – Centralised error-to-HTTP mapping; the string literal is the operation tag used for logging/correlation.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Provides `catchAs` (error serialization) and `refused` (denial short-circuit) helpers used in the response pipeline.
- **`src/infrastructure/http/ids.ts`** – Provides `requireId`, which reads a named param from `request.params`, responds `404` with the given i18n key if absent, and returns `undefined` to signal "stop processing."
- **`src/infrastructure/http/response.ts`** – Provides `successResponse`, the standard 200 JSON envelope writer.
- **`src/modules/payments/services/index.ts`** – Source of `paymentService`; the controller delegates all data access and auth-context propagation to `paymentService.getRefund`.
- **`src/modules/payments/routes.ts`** – The route table that binds this handler to `GET /payments/:id/refunds/:refundId`.
- **`src/types/index.ts`** – Source of the `Refund` type used in the generic parameter of `successResponse`.

## Notes

- Both path params (`id`, `refundId`) map to the same not-found message key `'payments.not-found'`. This is deliberate: a refund is only reachable through its payment, so an unknown refund is indistinguishable from an unknown payment from the client's perspective (avoids information leakage).
- The handler is a plain async function (returns a `Promise`), not an Express error-wrapped callback. Error handling is done via the `.catch(catchAs(...))` chain, not `try/catch` inside the handler body.
- `request.authContext` is forwarded directly to the service; no per-controller auth middleware is expected here (presumably mounted upstream in `routes.ts`).
