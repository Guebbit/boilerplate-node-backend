---
source: src/modules/orders/controllers/post-order-status-override.ts
sha256: f1df9e50a283a3f85ac2d1b6f32f46531ddee6b3799d6c4898f571e0c105f5c7
generated_at: 2026-11-08T06:47:09.297606+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-order-status-override.ts

## Purpose

Thin HTTP controller for `POST /orders/:id/status-override` — an admin endpoint that forces an order's status to a new value with a required reason, without triggering parcel or email side-effects. All business logic lives in the service; this file only validates inputs, calls the service, and shapes the response.

## Key elements

- **`postOrderStatusOverride(request, response)`** — The sole export. Resolves the order `:id`, parses the body against the `OverrideOrderStatusBody` Zod schema, delegates to `orderService.overrideStatus(id, body.to, body.reason, callerContext)`, then either returns the standard order response or short-circuits via `refused`.

## Relationships

- **`src/modules/orders/routes.ts`** — Registers this handler on `POST /orders/:id/status-override` and enforces `requirePermission('override', 'Order')` *before* the controller executes.
- **`src/modules/orders/services/index.ts`** — Supplies `orderService`; the controller calls `overrideStatus` (its only service interaction).
- **`src/modules/orders/controllers/respond.ts`** — `respondWithOrder` builds the success envelope (status code, payload, audit tag `'postOrderStatusOverride'`).
- **`src/infrastructure/http/controller.ts`** — Provides the shared `parseBody`, `refused`, and `catchAs` helpers used for input validation, rejection short-circuit, and error serialisation.
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `:id` param, emitting a `404` (`orders.not-found`) on miss.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` pulls the authenticated caller's audit context from the request for the service call.
- **`src/types/index.ts`** — Defines the `StatusOverrideRequest` generic type attached to the Express `Request` param.

## Notes

- Permission is **not** checked here; the route-level middleware already gates access with a step-up key. Do not add auth logic in this file.
- `refused(response, result)` is a specific "service said no" path (e.g. status transition not permitted) that is distinct from a thrown error; it returns early before `respondWithOrder` runs.
- The audit tag passed to `respondWithOrder` (`'postOrderStatusOverride'`) is also the tag used by `catchAs` for error logging — keep them in sync if the handler is renamed.
