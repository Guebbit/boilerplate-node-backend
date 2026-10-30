---
source: src/modules/orders/controllers/respond.ts
sha256: 5f9ef89ea9d7ffb5ab1f68c6d0e453fb8513cd2fb3e93a953b2b07a65fafeaa9
generated_at: 2026-10-29T04:39:18.623826+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/respond.ts

## Purpose

Shared success-path helper for every order controller that writes or reads a single order. It hydrates the order document returned by the service layer with the caller's computed `actions` (via `orderService.withActions`) and then sends the result as the HTTP response body. It is deliberately kept outside `services/scope.ts` so that `withActions` remains framework-free; each call site still supplies its own HTTP status and operation name.

## Key elements

- **`respondWithOrder`** (exported) — Accepts an Express `Response`, the order document, the caller's `AuthContext`, an operation-name string (for logging), and an optional `status` code. Calls `orderService.withActions`, then delegates to `createdOrOk` (which sets a `Location` header on 201 per RFC 9110 §9.3.3). Catches with `catchAs(response, context)` so a `withActions` failure logs under the *same* operation name as the caller's outer `.catch`.
- **`OrderForResponse`** (local type) — Derived as `Parameters<typeof orderService.withActions>[0]` rather than imported from `../model`, keeping the controller free of persistence-layer imports (`no-persistence-imports` lint rule).

## Relationships

- **`src/modules/orders/services/index.ts`** — Source of `orderService.withActions`, the single dependency this file calls at runtime.
- **`src/infrastructure/http/response.ts`** — Provides `createdOrOk`, which writes the status + body (and the 201 `Location` header).
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the error-handler factory passed to `.catch`.
- **`src/modules/orders/controllers/create-order.ts`** — Calls `respondWithOrder` with status `201`.
- **`src/modules/orders/controllers/get-order-item.ts`** — Calls `respondWithOrder` (default 200).
- **`src/modules/orders/controllers/post-cancel-order.ts`** — Calls `respondWithOrder` (default 200).
- **`src/modules/orders/controllers/post-order-status-override.ts`** — Calls `respondWithOrder` (default 200).
- **`src/modules/orders/controllers/put-shipping-address.ts`** — Calls `respondWithOrder` (default 200).
- **`src/types/auth-context.ts`** — Supplies the `AuthContext` type for the caller's identity parameter.
- **`src/types/index.ts`** — Supplies the `Order` type used in the `createdOrOk<Order>` generic.

## Notes

- The `context` string parameter is **not** an internal constant; each call site must pass the *same* operation name it uses in its own outer `.catch`. Passing a different name would split one logical failure into two log entries.
- `authContext` is typed `AuthContext | undefined` (not `AuthContext`) — the helper tolerates unauthenticated callers and simply skips action hydration.
- The optional `status` parameter defaults to `200`; only `create-order.ts` overrides it with `201`.
- Do not import `Order` from `../model` here; the lint rule `no-persistence-imports` forbids controllers from holding persistence handles.
