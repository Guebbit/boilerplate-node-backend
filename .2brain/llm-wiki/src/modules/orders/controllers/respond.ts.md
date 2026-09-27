---
source: src/modules/orders/controllers/respond.ts
sha256: 7f7ce0925aedfc4f376e43343cb2879ae1b62639c09fe97ab4bd5be71e0ee38a
generated_at: 2026-09-27T15:08:14.216911+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/respond.ts

## Purpose

Shared success-tail helper for every order controller (all write endpoints plus the single-order read). It hydrates the order document returned by the service with the caller's computed `actions`, then sends it as the standard success envelope. It lives in the controller layer (not `services/scope.ts`) so that `withActions` remains framework-free while the HTTP `Response`/status split stays at the call site.

## Key elements

- **`respondWithOrder`** (exported) — Takes an Express `Response`, the raw order document, the caller's `AuthContext | undefined`, the operation-name string, and optional `status` / `message`. Calls `orderService.withActions(order, authContext)`, then pipes the resolved order through `successResponse`. Owns its own `.catch(catchAs(response, context))` using the *same* `context` string the caller passes to its outer `.catch`, so a `withActions` failure is logged under one operation name rather than two.
- **`OrderForResponse`** (local type) — Derived via `Parameters<typeof orderService.withActions>[0]` instead of importing from `../model`. This keeps controllers free of persistence handles (enforced by the `no-persistence-imports` lint rule).

## Relationships

- **`src/modules/orders/services/index.ts`** — Imports `orderService` to call `withActions`; the type of the first parameter of that method also drives the local `OrderForResponse` alias.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse`, the envelope wrapper that serializes the resolved order onto the Express `Response`.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs`, the error-interceptor factory used for this helper's own `.catch`.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — Provides the `AuthContext` and `Order` types used in the function signature.
- **Controller call sites** (`create-order.ts`, `get-order-item.ts`, `post-cancel-order.ts`, `post-order-status-override.ts`) — Each invokes `respondWithOrder` after its own service call, passing its own `status` (e.g. 201 for create) and optional `message`, plus the shared operation-name string.

## Notes

- The `context` parameter must match the string the calling controller already passes to its *outer* `.catch(catchAs(response, context))`. Duplicating a different name would split one logical failure across two log entries.
- `authContext` is typed `AuthContext | undefined` because the single-order read endpoint may be called without a resolved caller; `withActions` tolerates that.
- Do not import the order model type directly here — the `OrderForResponse` alias exists specifically to satisfy `no-persistence-imports`.
