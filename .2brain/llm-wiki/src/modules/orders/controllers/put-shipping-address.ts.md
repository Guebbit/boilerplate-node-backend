---
source: src/modules/orders/controllers/put-shipping-address.ts
sha256: 13c809f8a59b556ce5a9cf35288429c85832346c15b206b72c3b6b651875374e
generated_at: 2026-10-29T04:39:08.310886+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/put-shipping-address.ts

## Purpose

Express handler for `PUT /orders/:id/shipping-address`. It validates the path param and request body, delegates to `orderService.correctShippingAddress`, and formats the response. All business logic lives in the service; this file is pure HTTP wiring.

## Key elements

- **`putShippingAddress`** (exported) — The sole export. Accepts Express `Request<{ id?: string }>` / `Response`, runs validation, calls the service, and dispatches the response.
- **Validation flow** — `requireId` checks the `:id` param (returns 404 with i18n key `orders.not-found`); `parseBody` validates `request.body` against the `CorrectOrderShippingAddressBody` Zod schema from `@api/schemas.zod`.
- **Service call** — `orderService.correctShippingAddress(id, body, callerContextOf(request))`.
- **Response handling** — `refused` short-circuits a service-level denial; `respondWithOrder` serialises the success payload; `catchAs` maps unexpected throws to an error response.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, `parseBody`, and `refused` utilities used throughout the handler.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId` for path-parameter extraction and 404 short-circuiting.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to derive the caller's identity/role context for the service call.
- **`src/modules/orders/controllers/respond.ts`** — Supplies `respondWithOrder`, the shared order-success responder (handles `authContext`-aware field masking).
- **`src/modules/orders/routes.ts`** — Registers `putShippingAddress` on the `PUT /orders/:id/shipping-address` route, gated by `requirePermission('update', 'Order')`.
- **`src/modules/orders/services/index.ts`** — Exposes `orderService.correctShippingAddress`, the actual business-logic method invoked here.

## Notes

- **No permission check in this file.** Authorization is enforced upstream in `routes.ts` via `requirePermission('update', 'Order')`; the controller assumes it has already passed.
- **Promise-chain style.** The handler uses `.then`/`.catch` rather than `async`/`await`, consistent with the surrounding controller set.
- **`refused` is a distinct outcome.** A "refused" service result (e.g., order already shipped) is handled separately from both success and thrown errors — it does not go through `respondWithOrder`.
