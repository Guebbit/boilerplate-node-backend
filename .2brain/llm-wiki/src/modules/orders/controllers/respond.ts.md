---
source: src/modules/orders/controllers/respond.ts
sha256: 5f9ef89ea9d7ffb5ab1f68c6d0e453fb8513cd2fb3e93a953b2b07a65fafeaa9
generated_at: 2026-11-08T06:47:37.859961+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/respond.ts

## Purpose

Shared "success tail" for every order controller (all write operations plus the single-order read). It hydrates the order document returned by a service with the caller's `actions` (via `orderService.withActions`) and sends it as the HTTP response body. Kept separate from the service layer on purpose: `withActions` stays framework-free, and the HTTP status / `Response` concerns live here where they genuinely differ per call site (e.g. 201 on create vs. 200 elsewhere).

## Key elements

- **`respondWithOrder(response, order, authContext, context, status?)`** — The sole export. Calls `orderService.withActions`, then writes the resolved order to the response via `createdOrOk`. Owns its own `.catch(catchAs(response, context))`, using the same operation-name string the caller already passes to its outer `.catch` so both failure points log under one name.
- **`OrderForResponse`** — A local type alias derived from `Parameters<typeof orderService.withActions>[0]` rather than importing the persistence model directly (respects the `no-persistence-imports` rule for controllers).
- **`createdOrOk`** (from `@infrastructure/http/response`) — Sends the body with the caller-supplied status; when status is 201 it also sets a `Location` header of `/orders/${id}` per RFC 9110 §9.3.3.
- **`catchAs`** (from `@infrastructure/http/controller`) — Standard error-to-response mapper; receives the operation-name string for structured logging.

## Relationships

- **`src/modules/orders/services/index.ts`** — Source of `orderService.withActions`, the core hydration call this file wraps.
- **`src/infrastructure/http/response.ts`** — Supplies `createdOrOk` for the status-aware body write.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` for error handling.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — Provide the `AuthContext` and `Order` types used in the signature.
- **Sister controllers** (`post-order`, `get-order`, `post-cancel-order`, `post-order-status-override`, `put-shipping-address`) — All call `respondWithOrder` as their terminal step after a service call succeeds, passing their own status code and operation-name string.

## Notes

- `status` is optional and defaults to 200; only `post-order` passes `201`. The `Location` header is set automatically by `createdOrOk` when 201 is in play.
- The `.catch` here is the *inner* catch for `withActions`; each controller still has its *outer* `.catch` around the service call. Both must use the identical `context` string so logs aren't split across two operation names.
- Do not import the order model type directly here — `OrderForResponse` is intentionally derived from the service's parameter type to avoid a persistence handle in controller scope.
