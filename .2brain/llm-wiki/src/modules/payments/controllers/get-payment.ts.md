---
source: src/modules/payments/controllers/get-payment.ts
sha256: 54e86142debc9fcaae275ec6e3015c0a3b2336b57f22a3a667289adf27ebf6b8
generated_at: 2026-10-29T05:02:27.882090+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-payment.ts

## Purpose

Controller handler for `GET /payments/:id`. Retrieves a single payment by its id and returns it to the caller. It is the destination that a `Location` header points to after a successful `POST /payments`, and the read-back target an operator-refund response sends a client back to.

## Key elements

- **`getPayment(request, response)`** (exported) — Express-style handler. Validates the `:id` param, delegates to the payment service, and either writes a 200 with the `Payment` payload or short-circuits on refusal/missing-id.
- **`requireId`** (from `@infrastructure/http/ids`) — Extracts and validates the `:id` route param; triggers a `payments.not-found` 404 and returns `undefined` when absent, causing the handler to exit early.
- **`paymentService.getById(id, authContext)`** (from `../services`) — Performs the actual lookup; receives the caller's auth context for per-row authorization.
- **`refused(response, result)`** / **`catchAs(response, 'getPayment')`** (from `@infrastructure/http/controller`) — Translate service-level refusal results and thrown errors into appropriate HTTP responses.
- **`successResponse<Payment>`** (from `@infrastructure/http/response`) — Wraps the successful `Payment` object in the standard success envelope.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Source of `refused` and `catchAs`, the two helpers that turn service outcomes into HTTP responses.
- **`src/infrastructure/http/ids.ts`** — Source of `requireId`, which guards the `:id` param before any service call.
- **`src/infrastructure/http/response.ts`** — Source of `successResponse`, the standard 200 envelope writer.
- **`src/modules/payments/services/index.ts`** — Provides `paymentService`; its `getById` method is the only business logic this controller invokes.
- **`src/modules/payments/routes.ts`** — Registers `getPayment` as the handler for the `GET /payments/:id` route.
- **`src/types/index.ts`** — Defines the `Payment` type used as the generic parameter on `successResponse`.

## Notes

- Authorization is **not** enforced in this controller. `request.authContext` is forwarded into `paymentService.getById`, so row-level access decisions live in the service layer.
- The early-return path (`if (!id) return Promise.resolve()`) keeps the return type consistently thenable so callers (or route middleware) can `.catch` uniformly.
- The service result is discriminated: `refused` handles "authorized-to-call but denied" (e.g., 403/404), while a thrown error is routed through `catchAs` (typically 500).
