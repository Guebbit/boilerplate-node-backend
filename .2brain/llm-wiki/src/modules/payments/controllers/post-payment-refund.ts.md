---
source: src/modules/payments/controllers/post-payment-refund.ts
sha256: 0d02cde96a5de4080bc036ff1d59d4d2de5bd654200ccb2061b018865e3a280f
generated_at: 2026-10-29T05:03:42.658578+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-refund.ts

## Purpose

Handles `POST /payments/:id/refunds`: creates a (full or partial) refund on an existing payment without altering the parent order's status. Returns **201 Created** with the new `Refund` record and a `Location` header. This is the operator's standalone refund action; "cancel and refund" is left to the client issuing this call *and* a separate order-cancel call.

## Key elements

- **`postPaymentRefund`** (exported) – Express handler accepting `Request<{ id?: string }>` and `Response`. Validates the payment ID, parses the JSON body against `CreateRefundBody`, delegates to `paymentService.refundPayment`, then re-fetches the refund record via `paymentService.refundOf` to build the 201 response body.
- **Module-level doc comment** – Documents the endpoint contract, the admin-only constraint (enforced at the route layer, not here), and the intentional separation from order cancellation.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Supplies `parseBody` (schema validation), `refused` (4xx short-circuit on service-level refusal), and `catchAs` (async error → HTTP mapping).
- **`src/infrastructure/http/ids.ts`** – Supplies `requireId`, which reads `request.params.id` and sends a 404 (`payments.not-found`) if absent or malformed.
- **`src/infrastructure/http/request.ts`** – Supplies `callerContextOf`, extracting caller identity from the request to pass into the service call.
- **`src/infrastructure/http/response.ts`** – Supplies `createdResponse`, which emits 201 with a `Location` header and JSON body.
- **`src/modules/payments/services/index.ts`** – Exports `paymentService`; this controller calls `refundPayment` (executes the refund) and `refundOf` (retrieves the resulting record from the payment).
- **`src/modules/payments/routes.ts`** – Registers this handler on the `POST /payments/:id/refunds` path and applies the admin-only guard.

## Notes

- The `refundOf` call after `refundPayment` is annotated as "unreachable on a success" — if it ever returns `null` the code throws, treating it as an invariant violation rather than a client-facing error.
- The controller is intentionally thin: no business rules, no auth checks (admin guard lives in `routes.ts`), no partial-refund arithmetic. All logic is in the service.
- The `paymentId` parameter type is `{ id?: string }` (optional in the generic) even though `requireId` guarantees presence before use — a pattern shared with sibling controllers.
