---
source: src/modules/payments/controllers/post-payment-refund-settle.ts
sha256: c4576cc4a59e284dfbf289d9dd062e3502ea0157091a5d0742af7424e44a8994
generated_at: 2026-10-29T05:03:29.901161+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-refund-settle.ts

## Purpose

HTTP handler for `POST /payments/:id/refunds/:refundId/settle`. An operator uses it to confirm that a refund's funds actually left the application. The controller extracts the two route IDs, delegates to the payment service, and returns the settled refund object on success.

## Key elements

- **`postPaymentRefundSettle`** (exported) — Express handler. Validates `id` and `refundId` via `requireId`, calls `paymentService.settleRefundByHand(paymentId, refundId, authContext, callerContext)`, then resolves the settled refund through `paymentService.refundOf` and sends it with a 200. On service refusal it short-circuits via `refused`; on any thrown error it delegates to `catchAs`.

## Relationships

- **`src/modules/payments/services/index.ts`** — imports `paymentService`; calls `settleRefundByHand` (business logic) and `refundOf` (lookup of the specific refund on the payment).
- **`src/infrastructure/http/controller.ts`** — imports `catchAs` (error-to-response mapping) and `refused` (checks whether the service result is a refusal and writes the corresponding HTTP reply).
- **`src/infrastructure/http/ids.ts`** — imports `requireId` to pull `id` / `refundId` from the route and return early with a 404 if missing.
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf` to extract the caller context passed alongside `authContext` into the service call.
- **`src/infrastructure/http/response.ts`** — imports `successResponse` to emit the 200 JSON body.
- **`src/modules/payments/routes.ts`** — registers this handler at the `POST /payments/:id/refunds/:refundId/settle` path.

## Notes

- The module doc comment states the route carries a **fresh-session requirement** (enforced elsewhere, likely in the route definition).
- The service is expected to **refuse** two cases: a refund with no final answer, and a refund that has already been settled. The controller has no special logic for these — it relies on `refused()` to translate the service's refusal into the HTTP response.
- The `if (!refund) throw …` line after a successful settle is a defensive assertion, not a reachable path in practice.
- The error thrown in that assertion uses a plain string message (no error code), consistent with the "unreachable" intent.
