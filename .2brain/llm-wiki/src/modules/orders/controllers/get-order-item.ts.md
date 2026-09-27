---
source: src/modules/orders/controllers/get-order-item.ts
sha256: 12da7acdc3deb975e997eb9557af1133a351c4d57d0a0497122beaba5d791bd8
generated_at: 2026-09-27T15:07:26.123706+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-order-item.ts

## Purpose

Single-order read controller for `GET /orders/:id`. It enforces a 404-vs-422 distinction by validating the path id *before* the database query runs, and scopes the lookup to the caller's permissions (non-admins see only their own orders).

## Key elements

- **`getOrderItem(request, response)`** — The sole export. Validates `request.params.id` with `isValidObjectId`; on failure returns 404 immediately. Otherwise delegates to `orderService.getById(id, orderService.callerScope(authContext))`, 404s on `null`, and on success calls `respondWithOrder` to shape the response body with role-aware actions.
- **404-before-query guard** — A malformed id would otherwise surface as a `BSONError` → 422 via the normal `.catch` path; this file deliberately avoids that by short-circuiting before the service call.

## Relationships

- **`src/modules/orders/routes.ts`** — Wires `getOrderItem` to the `GET /orders/:id` route.
- **`src/modules/orders/services/index.ts`** — Provides `orderService.getById` and `orderService.callerScope`, the actual data access and permission scoping.
- **`src/modules/orders/controllers/respond.ts`** — `respondWithOrder` builds the final response body including the caller's allowed actions for this order.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` sends the 404 early-exit responses.
- **`src/infrastructure/http/request.ts`** — `isValidObjectId` supplies the pre-query id validation.
- **`src/infrastructure/http/controller.ts`** — `catchAs` maps any service-layer rejection to a structured error response.
- **`src/infrastructure/i18n/context.ts` / `index.ts`** — `t('orders.not-found')` localises the 404 message.

## Notes

- The file's JSDoc explicitly contrasts this with "other single-item reads that let the query fail and map the error in `.catch`." If you add a similar controller, the 404-vs-422 rationale here is the pattern to follow.
- The response body embeds caller-specific actions (what *this* user may do), so the client should render controls from the server's answer rather than a shared lifecycle definition.
- `request.params.id` is typed as optional (`{ id?: string }`); the `isValidObjectId` guard also covers the `undefined` case.
