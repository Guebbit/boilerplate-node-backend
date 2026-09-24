---
source: src/modules/payments/routes.ts
sha256: 5f0795871ae7f99934070904d17cceb7cc174da359def65f1aa25c174f2bbc70
generated_at: 2026-09-23T19:20:38.476462+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/routes.ts

## Purpose

Express router that wires every payment endpoint to its controller, applying the correct authentication, authorization, idempotency, and rate-limit middleware per route. It enforces the module's security layering: two public routes above the auth wall, step-up-protected money-moving routes below it, and velocity limits on card validation.

## Key elements

- **`router`** (exported) — the sole export; an Express `Router` instance with all payment routes defined in order.
- **`POST /webhook`** — provider callback; uses `webhookLimiter` only (no session). Must stay above the auth wall.
- **`GET /methods`** — public list of offered payment methods; must stay above the auth wall.
- **`router.use(getAuth, isAuth)`** — the auth wall; every subsequent route requires a valid session.
- **`POST /intent`** — freezes an order's price. Guarded by `requireFreshAuth(REAUTH_TIME_CRITICAL)`, `requirePermission('cart.self.checkout')`, and `idempotencyKey`.
- **`GET /order/:orderId`** — reads back the payment for a given order (no extra guards beyond auth).
- **`GET /order-by-reference`** — admin RF-code lookup; requires `payments.any.create`. Literal path segment, not a param.
- **`POST /order/:orderId/refund`** — operator-initiated refund; requires `payments.any.update` + `idempotencyKey`.
- **`POST /order/:orderId/offline`** — admin records a manual payment; requires `payments.any.create` + `idempotencyKey`.
- **`POST /:id/confirm`** — card validation/submission. Stack: fresh-auth → permission → `paymentConfirmAttemptLimiter` → `paymentConfirmDeclineLimiter` → `paymentDeclineChallengeGate` → `idempotencyKey`.
- **`POST /:id/sync`** — browser reports provider completion. No `idempotencyKey` (idempotent by construction via provider reference).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, `requirePermission`, `requireFreshAuth`, and the `REAUTH_TIME_CRITICAL` constant used throughout.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — supplies the `idempotencyKey` middleware applied to all non-idempotent money-moving writes.
- **`src/modules/payments/rate-limits.ts`** — supplies `webhookLimiter`, `paymentConfirmAttemptLimiter`, `paymentConfirmDeclineLimiter`, and `paymentDeclineChallengeGate`.
- **Controllers (`./controllers/*`)** — each route's terminal handler is a named import from its dedicated controller file (e.g. `postPaymentConfirm`, `getPaymentMethods`, etc.).
- **`src/modules/payments/module.ts`** — mounts this router into the application.
- **`src/modules/payments/tests/unit/routes.test.ts`** — unit tests for route wiring and middleware order.
- **`tests/cross-cutting/step-up-auth-routes.test.ts`** — verifies the step-up/reauth behavior encoded in this router.

## Notes

- **`order-by-reference` is a literal segment**, not `/order/:ref`. It intentionally names no order ID; treating it as a param would match `/order/anything` and shadow the `:orderId` GET.
- **Refund and offline do NOT call `requireFreshAuth` explicitly.** The `stepUp: critical` tier is declared on the authorization key (`payments.any.update` / `payments.any.create`) in `shared/authorization-keys.yaml`, so `requirePermission` internally enforces the fresh-session check. Adding a redundant `requireFreshAuth` here would be a second source of truth.
- **`cart.self.checkout` is owned by the cart module**, not payments. Payments mounts it the same way `products/routes.ts` mounts `locales`-owned `translations.*`. Changes to that key live in the cart module.
- **Middleware order on `/:id/confirm` is deliberate**: velocity limiters and the challenge gate sit _before_ `idempotencyKey`, mirroring where `credentialLimiters`/`loginChallengeGate` sit on `POST /account/login`. Reordering changes what gets rate-limited vs. what gets deduplicated.
- **Webhook and `/methods` must remain above the `router.use(getAuth, isAuth)` line.** Moving them below would break provider deliveries (no session to skip) and hide public pre-purchase info behind login.
