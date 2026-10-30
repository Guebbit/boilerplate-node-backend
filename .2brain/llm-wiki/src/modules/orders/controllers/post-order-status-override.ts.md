---
source: src/modules/orders/controllers/post-order-status-override.ts
sha256: f1df9e50a283a3f85ac2d1b6f32f46531ddee6b3799d6c4898f571e0c105f5c7
generated_at: 2026-10-29T04:38:58.143962+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-order-status-override.ts

## Purpose
Thin Express controller for `POST /orders/:id/status-override`. Validates the path param and body, delegates to `orderService.overrideStatus`, and formats the response. By design it is a status-only mutation — it intentionally has no parcel or email side effects.

## Key elements
- **`postOrderStatusOverride`** (exported) — The sole handler. Sequence: `requireId` → `parseBody` (Zod schema) → `orderService.overrideStatus` → `respondWithOrder` / `refused` / `catchAs`.

## Relationships
- **`src/modules/orders/routes.ts`** — Registers this handler and applies `requirePermission('override', 'Order')` *before* it is called; the controller itself performs no auth check.
- **`src/modules/orders/services/index.ts`** — Source of `orderService.overrideStatus`, the single business-logic call.
- **`src/infrastructure/http/controller.ts`** — Supplies the shared `parseBody`, `refused`, and `catchAs` helpers.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId` for extracting the `:id` path parameter.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to forward caller identity into the service call.
- **`src/modules/orders/controllers/respond.ts`** — Supplies `respondWithOrder`, the shared success-responder that shapes the HTTP payload.
- **`src/types/index.ts`** — Exports the `StatusOverrideRequest` type used in the handler's generics.

## Notes
- Authorization is **not** checked here; it is enforced upstream by the route's `requirePermission` guard. Do not add redundant auth logic to this file.
- The handler uses a promise-chain (`.then` / `.catch`) rather than `async/await`, matching the pattern in sibling controllers in this directory.
- `refused` is checked *before* the success path; a non-undefined return from `refused` means the service rejected the override and the response has already been sent — do not add further logic after that branch.
