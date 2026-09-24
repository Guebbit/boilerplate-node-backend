---
source: src/modules/orders/controllers/post-order-status-override.ts
sha256: 41baaf2b0b47745890f7d384c0ebae9bc638f3832be64b45e7e02fde53127e07
generated_at: 2026-09-23T19:00:56.682632+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-order-status-override.ts

## Purpose

Admin controller for `POST /orders/:id/status-override`. It validates the order ID, parses a status-override body, delegates to `orderService.overrideStatus`, enriches the result with allowed actions, and returns the updated order. It is a "status-only door" — no parcel or email side effects are triggered.

## Key elements

- **`postOrderStatusOverride`** (exported `Request`/`Response` handler) — the sole handler for the route. Sequence:
    1. Guards `request.params.id` with `isValidObjectId`; 404s on failure.
    2. Parses the request body against the `OverrideOrderStatusBody` Zod schema via `parseBody`.
    3. Calls `orderService.overrideStatus(id, body.to, body.reason, callerContextOf(request))`.
    4. If the service result is refused, short-circuits via `refused`.
    5. Enriches the order with `orderService.withActions(order, request.authContext)` then responds via `successResponse`.
    6. Catches any thrown error with `catchAs(response, 'postOrderStatusOverride')`.

## Relationships

- **`src/modules/orders/routes.ts`** — registers the `POST /orders/:id/status-override` route and attaches `requirePermission('orders.any.override')` _before_ this handler runs.
- **`src/modules/orders/services/index.ts`** — provides `orderService`, whose `overrideStatus` and `withActions` methods do the actual work.
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs`, `parseBody`, `refused` (shared error/parse helpers).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf` (extracts actor identity) and `isValidObjectId` (param guard).
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` and `rejectResponse` (uniform response shaping).
- **`src/infrastructure/i18n/index.ts`** — supplies `t` for the 404 message (`orders.not-found`).
- **`src/types/index.ts`** — supplies the `StatusOverrideRequest` and `Order` types used in signatures.

## Notes

- The `id` route param is typed `string | undefined` in the handler's generic, so the explicit `isValidObjectId` check is required even though Express will only call the handler when a param is present.
- Permission enforcement is the _route's_ responsibility, not this file's. Do not add auth checks here; the route's `requirePermission` (step-up gated) already ran.
- Early-exit paths (404, parse failure) resolve the promise immediately with `return Promise.resolve()` rather than throwing, so the `.catch` chain is never reached.
