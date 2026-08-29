# src/modules/payments/controllers/post-payment-intent.ts

## Purpose
Express controller handler for `POST /payments/intent`. Validates the incoming body, delegates to `paymentService.createIntent`, and returns the created intent with a `201`. Intentionally thin: ownership checks, the `pending` status gate, and amount calculation all live in the service layer.

## Key elements
- **`postPaymentIntent(request, response)`** — exported handler. Parses the body with the `CreatePaymentIntentBody` Zod schema, calls `paymentService.createIntent(orderId, authContext)`, and responds with `201` on success.
- Uses `parseBody` / `refused` / `catchAs` from the HTTP controller helpers for validation, domain-rejection checks, and error serialisation respectively.
- Uses `successResponse` from the HTTP response module to send the final payload.

## Relationships
- **`src/modules/payments/routes.ts`** — registers `postPaymentIntent` as the handler for the `POST /payments/intent` route.
- **`src/modules/payments/service.ts`** — source of `paymentService.createIntent`, which contains all business logic (order ownership, `pending` gate, price freeze).
- **`src/infrastructure/http/controller.ts`** — supplies `parseBody`, `refused`, and `catchAs` (validation short-circuit, domain-rejection check, error formatting).
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the `201` reply.

## Notes
- Returns **201 Created**, not 200 — the intent is a newly created resource.
- No audit logging and no analytics events in this handler. Per the doc comment, an intent is a "page load's preparation, not a business event"; domain events fire later at confirm, where money actually moves.
- Error path uses `.catch(catchAs(...))` rather than `try/catch` — consistent with the codebase's promise-chain controller style.
- The `refused` guard handles *domain-level* rejections (e.g. order not in `pending` state) distinctly from thrown exceptions caught by `catchAs`.
