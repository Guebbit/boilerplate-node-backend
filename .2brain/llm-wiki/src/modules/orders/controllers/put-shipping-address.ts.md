---
source: src/modules/orders/controllers/put-shipping-address.ts
sha256: dff77ca340fa3722672964666685d44f85960f48d83f0f699579eb967aed9f29
generated_at: 2026-11-14T20:33:24.323420+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/put-shipping-address.ts

## Purpose

Thin HTTP handler for `PUT /orders/:id/shipping-address`. Validates the route parameter and request body, then delegates to `orderService.correctShippingAddress` to replace the shipping address on an unshipped order. All business logic lives in the service; this file only performs extraction, validation, and response shaping.

## Key elements

- **`putShippingAddress(request, response)`** (exported) — The sole export. Orchestrates the request lifecycle:
  1. Extracts and validates the `:id` param via `requireId`.
  2. Parses `request.body` against the `CorrectOrderShippingAddressBody` Zod schema.
  3. Calls `orderService.correctShippingAddress(id, body, callerContext)`.
  4. On success, sends the updated order through `respondWithOrder`.
  5. On rejection/error, short-circuits via `refused` / `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody`, `refused`, and `catchAs` (the standard validation / rejection / error-shape helpers).
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId` to extract the `:id` path parameter with a localized 404 message.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to build the caller context object passed into the service.
- **`src/modules/orders/services/index.ts`** — Exports `orderService`, whose `correctShippingAddress` method performs the actual address update.
- **`src/modules/orders/controllers/respond.ts`** — Provides `respondWithOrder` for the uniform success response.
- **`src/modules/orders/routes.ts`** — Registers `putShippingAddress` as the handler for the `PUT /orders/:id/shipping-address` route, where `requirePermission('update', 'Order')` is already applied upstream.

## Notes

- No `If-Match` / optimistic-concurrency header is expected. The doc comment explicitly states this is a staff fix-up of a single field with no GET on this URL.
- Authorization is enforced by the route middleware (`requirePermission('update', 'Order')`), not inside this handler.
- The `id` param is typed as `string | undefined` on the Express request generic; `requireId` narrows it and emits a 404 if absent, so the service always receives a non-empty string.
