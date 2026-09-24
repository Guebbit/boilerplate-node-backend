---
source: src/modules/cart/routes.ts
sha256: 56480da3c9afbfa62b3b896835961a6364c5933ce320f24f55cc7885084a4fb4
generated_at: 2026-09-23T18:31:53.929143+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/routes.ts

## Purpose

Express route table for all cart operations (view, add, update, remove, clear, checkout, reorder). It wires every route to its controller handler and applies the authentication/authorization middleware chain. The entire router sits behind `isAuth`; the checkout route adds step-up re-authentication, a module-specific permission, and response-cache invalidation.

## Key elements

- **`router`** (exported `Router`) — the single public export; mounted under `/cart` by the cart module.
- **`router.use(getAuth, isAuth)`** — blanket authentication for every route in this table.
- **`POST /checkout`** — the only route with an extended middleware chain: `requireFreshAuth(REAUTH_TIME_CRITICAL)` → `requirePermission('cart.self.checkout')` → `invalidateCache(['orders','products'])` → `postCheckout`.
- **Route registrations** — eight endpoints (`GET /summary`, `GET /`, `POST /`, `PUT /:productId`, `DELETE /:productId`, `DELETE /all`, `DELETE /`, `POST /checkout`, `POST /reorder/:orderId`) each bound to a controller import from `./controllers/*`.
- **`DELETE /`** and **`DELETE /:productId`** both delegate to the same handler (`deleteCartItem`); the former is an alias where `productId` is supplied in the request body.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, `requireFreshAuth`, `requirePermission`, and the `REAUTH_TIME_CRITICAL` constant applied on the checkout route.
- **`src/infrastructure/http/middlewares/cache.ts`** — supplies `invalidateCache`, called on `POST /checkout` to purge the `orders` and `products` response caches after stock is spent.
- **`src/modules/cart/controllers/*`** (eight files) — each exports the handler function that the corresponding route line invokes.
- **`src/modules/cart/module.ts`** — consumes the `router` export and mounts it at the `/cart` path.
- **`src/modules/cart/tests/unit/routes.test.ts`** — unit-tests the route wiring (paths, methods, middleware order).
- **`tests/cross-cutting/step-up-auth-routes.test.ts`** — integration-test that the checkout route enforces fresh-auth + permission.
- **`tests/support/routed-modules.ts`** — registers this router in the shared test-app harness.

## Notes

- **Mount order is load-bearing.** `DELETE /all` is registered _before_ `DELETE /:productId`. Express matches in registration order, so if `/:productId` came first, the literal string `"all"` would be captured as a product id.
- **`cart.self.checkout`** is the only authorization key this module declares (see `shared/authorization-keys.yaml`). No other cart route requires a permission beyond basic auth.
- **Cache invalidation is checkout-only.** Adding, removing, or reordering items does _not_ invalidate the `orders`/`products` caches; only a completed checkout does.
- `REAUTH_TIME_CRITICAL` is a shared constant (not a literal time value); it signals to the auth middleware that this endpoint demands the shortest possible session-freshness window.
