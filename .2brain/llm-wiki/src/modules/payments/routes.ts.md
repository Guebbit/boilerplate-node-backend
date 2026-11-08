---
source: src/modules/payments/routes.ts
sha256: 153fbf2dc7dd4f05bc6d4837689f35dc0557a523f364f1891d638760e49bdf6c
generated_at: 2026-11-08T07:24:59.160288+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/routes.ts

## Purpose

Defines the Express router and route table for all payment operations (intent creation, confirmation, sync, webhook, refund lifecycle, and read-back). It centralises the security layering — authentication, permission checks, fresh-session enforcement, rate limiting, and idempotency — in one place so that individual controllers stay focused on domain logic.

## Key elements

- **`router`** (exported) — the sole export; an Express `Router` instance with all payment routes wired up.
- **Auth wall** — `router.use(getAuth, isAuth)` splits the table into two zones: two public routes above (webhook, methods) and all authenticated routes below.
- **Public routes** — `POST /webhook/:provider` (provider-signed callback, no session) and `GET /methods` (pre-purchase information, same rationale as delivery methods).
- **Staff read routes** — `GET /`, `POST /search`, `GET /refunds`, `GET /attention` all guarded by `requirePermission('display', 'Payment')` and tagged `privateNoCache` or `noStore`.
- **Money-moving customer routes** — `POST /` (create intent), `POST /:id/confirm`, `POST /:id/sync` — all require `requirePermission('checkout', 'Cart')` + `requireFreshAuth('critical')`.
- **Refund routes** — `POST /:id/refunds` (create, idempotency key **required**), `POST /:id/refunds/:refundId/settle` and `/:refundId/cancel` (idempotency key **optional**; 409 on double-apply). All use the `create:Refund` permission whose `stepUp: critical` is declared in `shared/authorization-keys.yaml` rather than in this file.
- **Read-by-id routes** — `GET /:id` and `GET /:id/refunds/:refundId` carry no permission guard; scoping is delegated to the service layer (unauthorised = same 404 as missing).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, `requirePermission`, and `requireFreshAuth`; every authenticated route in this file depends on these for its guard chain.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — supplies `idempotencyKey` (optional) and `requireIdempotencyKey` (mandatory); applied to refund creation and to confirm/settle/cancel routes.
- **`src/infrastructure/http/middlewares/cache.ts`** — supplies `noStore` and `privateNoCache` headers applied to staff read and POST routes to prevent shared caching of sensitive payment data.
- **Controllers** (`get-payment`, `get-payments`, `get-payment-methods`, `get-payment-attention`, `get-refund`, `get-refunds`, `post-payment-confirm`, `post-payment-refund`, `post-payment-refund-settle`, `post-payment-refund-cancel`, `post-payment-sync`, `post-payment-webhook`) — each is the terminal handler for exactly one route defined here; this file is the only place their middleware ordering is specified.

## Notes

- **Route ordering matters.** `GET /:id` is declared *after* the literal segments (`/refunds`, `/attention`, `/methods`) so that the parameterised route does not swallow them. Reordering these declarations silently breaks the staff pages.
- **Idempotency key is deliberately absent on `POST /`** (intent creation) because re-calling it already refreshes the same intent, and storing the `clientSecret` in the idempotency ledger would be a leak.
- **Idempotency key is absent on `POST /:id/sync`** because the operation is idempotent by construction — it is keyed on the provider's own payment reference, so a duplicate call settles the same outcome.
- **`requireFreshAuth` on `create:Refund` is implicit.** The key's `stepUp: critical` declaration in `shared/authorization-keys.yaml` causes the auth middleware to demand a fresh session; the route does not call `requireFreshAuth` explicitly for that key.
- **Card-testing rate limiters** (`paymentConfirmAttemptLimiter`, `paymentConfirmDeclineLimiter`, `paymentConfirmDeclineBlockLimiter`, `paymentDeclineChallengeGate`) apply *only* to `POST /:id/confirm`, mirroring the credential-challenge pattern on `POST /account/login`. They are imported from `./rate-limits`, not from the graph neighbors listed above.
- **Cache headers follow the POST rule (RFC 9111 §3.5):** `noStore` on `POST /search`, `privateNoCache` on GET routes — the response is the shop's financial data and must never enter a shared cache.
