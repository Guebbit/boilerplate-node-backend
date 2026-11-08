---
source: src/modules/orders/controllers/put-shipping-address.ts
sha256: 13c809f8a59b556ce5a9cf35288429c85832346c15b206b72c3b6b651875374e
generated_at: 2026-11-08T06:47:27.237381+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/put-shipping-address.ts

## Purpose

Thin HTTP controller for `PUT /orders/:id/shipping-address`. It validates the order ID and request body, delegates to `orderService.correctShippingAddress`, and formats the response. All business logic lives in the service layer; this file only wires the HTTP boundary.

## Key elements

- **`putShippingAddress`** (exported) — The sole handler. Sequence: `requireId` → `parseBody(CorrectOrderShippingAddressBody)` → `orderService.correctShippingAddress(id, body, callerContextOf(request))` → `respondWithOrder` / `refused` / `catchAs`.

## Relationships

- **`src/modules/orders/routes.ts`** — Registers `putShippingAddress` on the `PUT /orders/:id/shipping-address` route, with `requirePermission('update', 'Order')` applied before this handler runs.
- **`src/modules/orders/services/index.ts`** — Source of `orderService.correctShippingAddress`, which performs the actual address correction.
- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody`, `refused`, and `catchAs` for body validation and uniform error handling.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId` to validate and extract the `:id` param.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to pass the authenticated caller's context into the service.
- **`src/modules/orders/controllers/respond.ts`** — Supplies `respondWithOrder`, which serialises the service result into the HTTP response.

## Notes

- Permission checking (`requirePermission('update', 'Order')`) is applied at the **route** level, not inside this handler. Do not add auth checks here.
- Body validation uses the Zod schema `CorrectOrderShippingAddressBody` from `@api/schemas.zod`; the schema is the single source of truth for accepted fields.
- The handler is written in promise-chaining style (`.then`/`.catch`) rather than `async`/`await`, consistent with the project's controller convention.
