---
source: src/modules/orders/controllers/respond.ts
sha256: aa61b6cb91b480dbe2474c240db81d4001e051bb983a3cf6882eccc391abb6a3
generated_at: 2026-11-14T20:33:47.989658+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/respond.ts

## Purpose

Shared success-path helper for every order controller (reads and writes). It hydrates the order document returned by the service with the caller's `actions` (via `orderService.withActions`) and sends it as the HTTP response. Extracted from the individual controllers so the hydrate-then-send shape is written once, while each call site still declares its own status code and error context.

## Key elements

- **`OrderForResponse`** (type) — Derived from `Parameters<typeof orderService.withActions>[0]` rather than imported from the model layer, satisfying the `no-persistence-imports` controller rule.
- **`respondWithOrder(response, order, authContext, context, status?)`** (exported const) — Calls `orderService.withActions`, then on success: sets `ETag` + `Content-Location` via `answerAsResource`, sends the body with `createdOrOk` (passing through `status` for 201 vs. default 200), and attaches `Location` on a write. On failure, routes to `catchAs(response, context)`.

## Relationships

- **`src/modules/orders/services/index.ts`** — Imports the order service to hydrate the order document with caller-specific actions; also the source from which `OrderForResponse` is derived.
- **`src/infrastructure/http/response.ts`** — Imports `createdOrOk` to serialize the resolved order and apply status + `Location`.
- **`src/infrastructure/http/preconditions.ts`** — Imports `answerAsResource` to stamp `ETag` and `Content-Location` on the response.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` for the error path, reusing the caller-supplied `context` string.
- **`src/types/auth-context.ts`** — Imports the `AuthContext` type for the `authContext` parameter.
- **`src/types/index.ts`** — Imports the `Order` type (used in the `createdOrOk` generic and JSDoc).
- **Consumer controllers** (`get-order.ts`, `post-order.ts`, `post-cancel-order.ts`, `post-order-override-status.ts`, `put-shipping-address.ts`) — Each calls `respondWithOrder` as its final success step, passing its own status code (200 or 201) and an operation-name string.

## Notes

- The internal `.catch` intentionally reuses the caller's `context` (operation name) rather than introducing a second name, so a `withActions` failure logs under the same operation as the preceding service call.
- `withActions` is kept framework-free (no Express types); this file is where Express `Response` handling is introduced.
- `status` is optional and defaults to 200; only `post-order` passes `201`. The `Location` header is set on every write via `createdOrOk`.
