---
source: src/modules/payments/controllers/post-payment-refund-cancel.ts
sha256: dbfa7fbd21401a877f9498894dde3112c4e1396aab5e7ae4e2a809f581275daa
generated_at: 2026-11-08T07:18:16.273052+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-refund-cancel.ts

## Purpose

Controller handler for `POST /payments/:id/refunds/:refundId/cancel`. It lets staff void a refund before it can be paid out. The handler extracts route IDs and the request body, delegates the cancellation to the payment service, and returns the voided refund object.

## Key elements

- **`postPaymentRefundCancel`** (exported) — The Express route handler. Validates `paymentId` and `refundId` via `requireId`, parses the body against `CancelRefundBody`, then calls `paymentService.cancelRefund`. On success it looks up the voided refund on the payment and responds with it (HTTP 200). On service refusal it short-circuits via `refused`; on thrown errors it delegates to `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** (`src/infrastructure/http/controller.ts`) — Supplies the `catchAs`, `parseBody`, and `refused` helpers used for error handling, body validation, and service-refusal checks.
- **`@infrastructure/http/ids`** (`src/infrastructure/http/ids.ts`) — Supplies `requireId` to safely extract `paymentId` and `refundId` from route params.
- **`@infrastructure/http/request`** (`src/infrastructure/http/request.ts`) — Supplies `callerContextOf` to capture the authenticated caller's context for the service call.
- **`@infrastructure/http/response`** (`src/infrastructure/http/response.ts`) — Supplies `successResponse` to emit the 200 JSON reply.
- **`../services`** (`src/modules/payments/services/index.ts`) — Provides `paymentService.cancelRefund` (the domain logic) and `paymentService.refundOf` (lookup of the voided refund on the payment).
- **`../routes`** (`src/modules/payments/routes.ts`) — Registers this handler on the `POST /payments/:id/refunds/:refundId/cancel` route.

## Notes

- The doc comment references a `create:Refund` permission and a "fresh-session requirement" enforced at the route level (in `routes.ts`), not in this controller.
- The service is expected to refuse refunds that are already closed or that "may have moved money"; the controller treats any refusal generically via `refused()`.
- The `refundOf` lookup after a successful cancel is annotated as unreachable on the happy path — it is a defensive invariant check that throws a hard error if the voided refund is somehow missing from its parent payment.
- The success response is **200** with the refund body (not 204/No Content).
