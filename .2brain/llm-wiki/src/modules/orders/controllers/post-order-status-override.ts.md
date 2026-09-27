---
source: src/modules/orders/controllers/post-order-status-override.ts
sha256: bb6f07e2af906988922e2b9a4bc52219aa4748110b23a3cf3b38230fa5be08b8
generated_at: 2026-09-27T15:08:03.648118+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-order-status-override.ts

## Purpose

Controller handler for `POST /orders/:id/status-override`. It is a thin admin endpoint that forces an order's status to a new value with a recorded reason, explicitly without triggering any parcel or email side effects. All wiring delegates to `orderService.overrideStatus`.

## Key elements

- **`postOrderStatusOverride`** (exported) — Express handler. Validates the `:id` route param, parses the body against the `OverrideOrderStatusBody` Zod schema, calls `orderService.overrideStatus(id, to, reason, callerContext)`, and renders the result via `respondWithOrder`. Handles refusal short-circuits and unexpected errors through the shared `refused` / `catchAs` helpers.

## Relationships

- **`routes.ts`** — registers this handler at `POST /orders/:id/status-override` behind the `requirePermission('orders.any.override')` guard; permission is already enforced before this file runs.
- **`services/index.ts`** — source of `orderService.overrideStatus`, the sole business-logic call this controller makes.
- **`respond.ts`** — provides `respondWithOrder`, the shared success-renderer for order payloads.
- **`controller.ts`** (infrastructure) — supplies the `parseBody`, `refused`, and `catchAs` helpers used throughout.
- **`request.ts`** (infrastructure) — supplies `isValidObjectId` (param check) and `callerContextOf` (audit context extraction).
- **`response.ts`** (infrastructure) — supplies `rejectResponse` for the 404 short-circuit.
- **`i18n/index.ts` / `context.ts`** — supplies the `t()` function used for the `orders.not-found` message.
- **`types/index.ts`** — defines `StatusOverrideRequest` used as the typed body parameter.

## Notes

- The `id` param is typed as optional (`id?: string`) in the route-generics, which is why the handler must explicitly call `isValidObjectId` before proceeding.
- The module docstring calls this the "status-only door": it deliberately does **not** invoke parcel creation or email dispatch. Do not add such side effects here; they belong in a different endpoint.
- The permission key (`orders.any.override`) is step-up gated at the route level; this controller performs no additional auth checks.
