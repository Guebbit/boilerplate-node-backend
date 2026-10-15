---
source: src/modules/payments/controllers/post-payment-refund.ts
sha256: 2e68d614d6d5a5ca25cf03fb75c3a097e7e0224581d0bd6ff681b77e619a7a79
generated_at: 2026-10-15T11:24:19.195925+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-refund.ts

## Purpose

HTTP controller for `POST /payments/order/:orderId/refund`. Handles an admin-initiated refund (full or partial) of an order's payment without altering the order's status. Kept as a standalone endpoint so an operator can refund, cancel, or do both independently.

## Key elements

- **`postPaymentRefund`** (exported) — Route handler. Validates `orderId` via `requireId`, parses the request body against `RefundPaymentByOrderBody` (Zod schema), delegates to `paymentService.refundByOrder(orderId, authContext, callerContext, body)`, then shapes the `Payment` result through `presentPayment` (scoped by `readsAllPayments`) and sends a 200 response. Errors are funnelled through `refused` / `catchAs`.

## Relationships

- **`src/modules/payments/routes.ts`** — Registers `postPaymentRefund` as the handler for the refund route; enforces admin-only access at this layer.
- **`src/modules/payments/services/index.ts`** — Source of `paymentService` (executes the refund) and `readsAllPayments` (a scope predicate passed to the presenter).
- **`src/modules/payments/services/scope.ts`** — Likely origin of `readsAllPayments`; determines which `Payment` fields are visible to the caller.
- **`src/modules/payments/presenter.ts`** — `presentPayment` converts the raw `Payment` domain object into the API response shape, respecting the `readsAllPayments` scope.
- **`src/infrastructure/http/controller.ts`** — Provides the shared helpers `parseBody`, `refused`, and `catchAs` used for body validation, business-rejection handling, and error serialisation.
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `orderId` param, short-circuiting with a 404 if absent.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` derives the caller's contextual metadata (e.g. IP, user-agent) passed to the service.
- **`src/infrastructure/http/response.ts`** — `successResponse` serialises the final JSON envelope.
- **`src/types/index.ts`** — Defines the `Payment` type used as the response payload.

## Notes

- The controller deliberately does **not** change order status; "cancel and refund" is modelled as two separate client calls (this endpoint + the cancel endpoint) so each can be done independently.
- `readsAllPayments(request.authContext)` is a *scope function*, not a boolean flag — the presenter uses it field-by-field, so the same `Payment` shape can yield different payloads for different roles.
- The `orderId` in the route is treated as optional at the type level (`{ orderId?: string }`) and validated at runtime by `requireId`; do not assume it is present before the guard.
