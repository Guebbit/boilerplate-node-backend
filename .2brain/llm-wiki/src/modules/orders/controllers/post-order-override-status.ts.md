---
source: src/modules/orders/controllers/post-order-override-status.ts
sha256: 852dcf99f95775922da01dae1fff170f05ea44fda25a49daf19647bd6dc2c351
generated_at: 2026-11-14T20:32:53.029076+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-order-override-status.ts

## Purpose

Admin controller for `POST /orders/:id/override-status`. It is a thin HTTP-layer handler that validates the request, delegates to `orderService.overrideStatus`, and formats the response. It enforces a **status-only** override (no parcel or email side-effects). Authorization (`requirePermission('override', 'Order')`, step-up gated) is handled upstream at the route, not here.

## Key elements

- **`postOrderOverrideStatus`** (exported) – Express handler. Extracts the order `id`, parses the body against the `OverrideOrderStatusBody` Zod schema, calls `orderService.overrideStatus(id, body.to, body.reason, callerContextOf(request))`, then either short-circuits on refusal, responds via `respondWithOrder`, or funnels errors through `catchAs`.
- **Guard-clause pattern** – Early `Promise.resolve()` returns after `requireId` / `parseBody` failures; the caller never sees a rejected promise for those cases.

## Relationships

- **`src/modules/orders/routes.ts`** – Registers this handler on the `POST /orders/:id/override-status` path and attaches the `requirePermission('override', 'Order')` guard before the controller runs.
- **`src/modules/orders/services/index.ts`** – Source of `orderService`; the `overrideStatus` method contains all business logic (validation, persistence, event emission).
- **`src/infrastructure/http/controller.ts`** – Provides the `catchAs`, `parseBody`, and `refused` utilities used for uniform error/refusal handling.
- **`src/infrastructure/http/ids.ts`** – Provides `requireId` to validate the `:id` route parameter.
- **`src/infrastructure/http/request.ts`** – Provides `callerContextOf` to extract the authenticated caller's context for the service call.
- **`src/modules/orders/controllers/respond.ts`** – Provides `respondWithOrder`, the shared serializer that shapes the order payload and auth context into the HTTP response.
- **`src/types/index.ts`** – Source of the `StatusOverrideRequest` type used in the Express generics.

## Notes

- The doc block calls this the "status-only door" in contrast to a full override endpoint (which would also trigger parcel/email actions). Do not add side-effects here; they belong in the service.
- The permission check is **not** in this file. Searching this file for auth logic will come up empty.
- `StatusOverrideRequest` is imported from `@types` (project-level barrel), while the Zod schema `OverrideOrderStatusBody` comes from `@api/schemas.zod` — keep both in sync when adding fields.
