---
source: src/modules/payments/controllers/get-payment.ts
sha256: 54e86142debc9fcaae275ec6e3015c0a3b2336b57f22a3a667289adf27ebf6b8
generated_at: 2026-11-08T07:17:18.023210+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-payment.ts

## Purpose

HTTP handler for `GET /payments/:id`. Resolves a single payment by its ID and returns it as a JSON response. It exists as the destination target for the `Location` header set after a successful `POST /payments` and for operator-refund redirects that send a client back to read the payment they just interacted with.

## Key elements

- **`getPayment`** *(exported function)* — Accepts an Express `Request<{ id?: string }>` and `Response`. Extracts and validates the `:id` param, calls `paymentService.getById(id, request.authContext)`, then either short-circuits on a refusal or serialises the `Payment` via `successResponse`. Errors are delegated to `catchAs(response, 'getPayment')`.

## Relationships

- **`src/modules/payments/routes.ts`** — Registers `getPayment` as the handler for the `GET /payments/:id` route.
- **`src/modules/payments/services/index.ts`** — Source of `paymentService`, whose `getById(id, authContext)` method performs the actual data fetch.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId`, which parses the route param and emits a 404 (`payments.not-found`) if absent.
- **`src/infrastructure/http/controller.ts`** — Supplies `refused` (short-circuit on denied access) and `catchAs` (async error → HTTP response).
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard 200 JSON envelope writer.
- **`src/types/index.ts`** — Source of the `Payment` type used as the generic on `successResponse`.

## Notes

- The handler is an async-returning function (not a class method); it fits the project's functional-controller convention.
- `request.authContext` is forwarded to the service call, meaning authorization scoping happens inside `paymentService.getById`, not in the controller.
- If `requireId` fails it sends its own response and the handler returns `Promise.resolve()` immediately—no further work runs.
