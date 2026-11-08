---
source: src/modules/payments/controllers/post-payment-sync.ts
sha256: 05cac0d87ba537db3fd2c2a9f6288345a38806d3d95ce393b6455c9b86f7b06b
generated_at: 2026-11-08T07:18:50.120329+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-sync.ts

## Purpose

Controller handler for `POST /payments/:id/sync`. When the browser signals it has finished a provider-side flow (3-D Secure challenge, wallet sheet), this endpoint re-reads the provider's own payment record and applies it, making the happy path *feel* synchronous to the user while the webhook remains the authoritative settlement mechanism. The operation is idempotent: a payment that is already settled responds without contacting the provider again.

## Key elements

- **`postPaymentSync`** (exported) — The sole handler. Extracts the payment ID, calls `paymentService.syncPayment`, then calls `paymentService.presentWithActions` to enrich the result with available actions before returning a `200` with the full `Payment` object.
- **Early-exit guards** — `requireId` responds with a 404 if the param is missing; `refused` short-circuits when the service layer signals a domain-level refusal (e.g. wrong state).
- **Error boundary** — The entire promise chain is wrapped in `catchAs(response, 'postPaymentSync')` so unexpected rejections become a structured error response.

## Relationships

- **`src/modules/payments/routes.ts`** — Registers `postPaymentSync` as the handler for the `POST /payments/:id/sync` route.
- **`src/modules/payments/services/index.ts`** — Source of `paymentService`, which provides the two service methods this controller orchestrates: `syncPayment` and `presentWithActions`.
- **`src/infrastructure/http/controller.ts`** — Supplies the `refused` and `catchAs` helpers used for domain-refusal short-circuiting and error handling.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId`, which validates the `:id` route parameter and writes the 404 response itself when absent.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, extracting the authenticated caller's context to pass into the service layer.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, which serialises the `Payment` payload and sets status 200.
- **`src/types/index.ts`** — Defines the `Payment` type used as the generic parameter of the success response.

## Notes

- The controller is deliberately thin: all domain logic (state transitions, provider calls, idempotency checks) lives in `paymentService.syncPayment`. The controller only wires request context into the service and shapes the HTTP response.
- `requireId` is a *respond-and-return* helper: when it fires, the `Response` is already sent, so the `if (!paymentId) return;` guard is required to prevent falling through to the service call.
- The file exports exactly one function; there are no classes or side effects at module load time.
