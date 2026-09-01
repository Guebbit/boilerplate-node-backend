# src/modules/payments/controllers/post-payment-intent.ts

## Purpose

HTTP handler for `POST /payments/intent`. It validates the request body, delegates to the payment service to freeze an order's price into a payment intent, and returns `201`. It is intentionally a thin pass-through: ownership checks, the `pending` gate, and amount logic all live in the service layer. No audit or analytics events are emitted here—intent creation is a preparation step, not a business event (those fire on confirm).

## Key elements

- **`postPaymentIntent`** (exported function) — Express handler. Parses the body against `CreatePaymentIntentBody`, calls `paymentService.createIntent(orderId, authContext)`, responds `201` with the result data, or short-circuits via `refused` / `catchAs`.

## Relationships

- **`src/modules/payments/routes.ts`** — Imports `postPaymentIntent` and wires it to the `POST /payments/intent` route.
- **`src/modules/payments/service.ts`** — Provides `paymentService.createIntent`, which contains all business logic (ownership, `pending` gate, amount resolution).
- **`src/infrastructure/http/controller.ts`** — Supplies the `parseBody`, `refused`, and `catchAs` helpers used for input validation and error handling.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the 201 reply.

## Notes

- The handler is deliberately minimal. If you need to add side-effects (analytics, audit), the project convention is to do so in the **confirm** flow, not here.
- `parseBody` writes its own error response and returns `undefined` on failure; the handler early-returns in that case rather than throwing.
- The auth context is read from `request.authContext` (set upstream, e.g. by middleware) and forwarded verbatim to the service—no auth logic lives in this file.
