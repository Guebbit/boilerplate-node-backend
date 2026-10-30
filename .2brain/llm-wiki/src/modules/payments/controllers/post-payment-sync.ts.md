---
source: src/modules/payments/controllers/post-payment-sync.ts
sha256: 05cac0d87ba537db3fd2c2a9f6288345a38806d3d95ce393b6455c9b86f7b06b
generated_at: 2026-10-29T05:03:52.792473+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-sync.ts

## Purpose

HTTP handler for `POST /payments/:id/sync`. When the browser finishes a provider-side step (3-D Secure challenge, wallet sheet), this endpoint re-reads the provider's own record and applies it, making the happy path feel synchronous to the user while the webhook remains the source of truth. Already-settled payments short-circuit without re-querying the provider (idempotent).

## Key elements

- **`postPaymentSync(request, response)`** — the sole export. Extracts and validates the `:id` path param, calls `paymentService.syncPayment(id, authContext, callerContext)`, then shapes the reply through `paymentService.presentWithActions` before sending a `200` with the `Payment`. Any refusal is short-circuited; all errors are funneled through `catchAs`.

## Relationships

| Neighbor | Role here |
|---|---|
| `src/infrastructure/http/ids.ts` | `requireId` extracts and validates the `:id` param; aborts with `404` if missing. |
| `src/infrastructure/http/request.ts` | `callerContextOf(request)` supplies the caller context passed into `syncPayment`. |
| `src/infrastructure/http/response.ts` | `successResponse` emits the final `200` with the shaped `Payment` body. |
| `src/infrastructure/http/controller.ts` | `refused` detects and handles a rejected result; `catchAs` maps thrown errors to an error response. |
| `src/modules/payments/services/index.ts` | `paymentService.syncPayment` performs the provider re-read/apply; `paymentService.presentWithActions` serialises the result for the client. |
| `src/modules/payments/routes.ts` | Registers this handler at the `POST /payments/:id/sync` route. |
| `src/types/index.ts` | `Payment` type used in the response generic. |

## Notes

- The route param is typed `id?: string` (optional at the type level) but is **required at runtime**; `requireId` enforces this and short-circuits the handler if absent.
- Uses an explicit promise chain (`.then`/`.catch`) rather than `async/await`; the error path is a single `catchAs` call that maps any rejection to a structured error response.
- Idempotency is a deliberate design choice: if the payment is already settled, `syncPayment` answers from local state without a provider round-trip.
