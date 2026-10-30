---
source: src/modules/payments/routes.ts
sha256: 153fbf2dc7dd4f05bc6d4837689f35dc0557a523f364f1891d638760e49bdf6c
generated_at: 2026-10-29T05:09:35.158492+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/routes.ts

## Purpose

Express router that wires every payment HTTP endpoint to its controller and enforces the cross-cutting concerns (authentication, authorization, rate limiting, idempotency, cache-control) at the router level before any controller runs. It exists as a single, ordered declaration of routes so that public endpoints stay above the auth wall and sensitive money-movement routes carry the strongest guards.

## Key elements

- **`router`** (exported) — the sole export; an Express `Router` instance containing all payment routes.
- **Public routes** (above the auth wall): `POST /webhook/:provider` (provider callback, signed-body auth via `webhookLimiter`) and `GET /methods` (pre-purchase info). Both must remain above `router.use(getAuth, isAuth)`.
- **Staff routes** — `GET /`, `POST /search`, `GET /refunds`, `GET /attention`: gated by `requirePermission('display', 'Payment')` and marked `privateNoCache` / `noStore`.
- **Customer money-movement routes** — `POST /` (intent), `POST /:id/confirm`, `POST /:id/sync`: all require `requirePermission('checkout', 'Cart')` + `requireFreshAuth('critical')` + `paymentIntentLimiter` (shared between intent and sync). Confirm additionally stacks three velocity limiters and `paymentDeclineChallengeGate` before `idempotencyKey`.
- **Refund routes** — `POST /:id/refunds` (required `requireIdempotencyKey`), `POST /:id/refunds/:refundId/settle` and `/:refundId/cancel` (optional `idempotencyKey`; 409 prevents double-action). All use `requirePermission('create', 'Refund')`; the fresh-auth guard is supplied by the key's `stepUp: critical` rather than an explicit call.
- **Read routes** — `GET /:id`, `GET /:id/refunds/:refundId`: no permission guard; scoping is done in the service layer (stranger's ID → 404).

## Relationships

- **`@kernel/middlewares/authorizations`** — provides `getAuth`, `isAuth`, `requirePermission`, `requireFreshAuth`; applied as middleware on individual routes or as `router.use` for the auth wall.
- **`@infrastructure/http/middlewares/idempotency`** — `requireIdempotencyKey` (refund creation) and `idempotencyKey` (settle/cancel/confirm) enforce or optionally accept a client-supplied replay key.
- **`@infrastructure/http/middlewares/cache`** — `noStore` and `privateNoCache` set `Cache-Control` on staff list/search responses so payment data is never shared-cached.
- **Controllers** (all listed neighbors under `src/modules/payments/controllers/`) — each is the terminal handler for exactly one route; this file never contains business logic, only guard ordering and route matching.

## Notes

- **Route order is load-bearing.** Literal GETs (`/refunds`, `/attention`) are declared before the parametric `GET /:id`; a bare `/:id` would swallow them. Webhook and `/methods` must stay above the `router.use(getAuth, isAuth)` line.
- **`checkout:Cart` is owned by the `cart` module**, not `payments`. This file mounts it the same way `products/routes.ts` mounts a `locales`-owned key — the key definition lives elsewhere.
- **Idempotency key is deliberately absent** on `POST /` (re-calling refreshes the same intent; the ledger would store `clientSecret`), on `/:id/sync` (idempotent by provider reference), and on `/:id/confirm` (replay is bounded by the velocity limiters instead).
- **`paymentIntentLimiter` is shared** between `POST /` and `POST /:id/sync`; both end in a provider call and spend the same per-account budget.
- **Fresh-auth on refund routes** is not spelled out here; it is inherited from the `create:Refund` key's `stepUp: critical` in `shared/authorization-keys.yaml`, keeping the tier tied to the action rather than to one route.
