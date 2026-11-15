---
source: src/modules/payments/routes.ts
sha256: 8ef2d4796e080aa3ffc122c0974394c305c27737069f962b92f81e27cea0bc69
generated_at: 2026-11-14T21:05:40.861381+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/routes.ts

## Purpose

Express router defining the complete HTTP route table for payment operations. It layers authentication, authorization, rate-limiting, and idempotency guards per route so that the webhook (machine caller) and the public `/methods` lookup stay outside the auth wall, while every route that reads or moves money sits behind session auth plus route-specific permission and freshness checks.

## Key elements

- **`router`** (exported `Router`) — the single artifact this file produces; consumed by the parent HTTP server.
- **Pre-auth routes** — `POST /webhook/:provider` (provider callback, signature-authenticated, `webhookLimiter`) and `GET /methods` (public, mirrors `GET /delivery/methods`).
- **Staff read routes** — `GET /`, `POST /search`, `GET /refunds`, `GET /attention`; guarded by `requirePermission('display','Payment')` + `privateNoCache`/`noStore`.
- **Customer money routes** — `POST /` (create intent), `POST /:id/confirm` (validate card), `POST /:id/sync` (report provider outcome); each requires `checkout:Cart` + `requireFreshAuth('critical')` and a shared `paymentIntentLimiter` (confirm adds three velocity limiters + a challenge gate).
- **Admin refund routes** — `POST /:id/refunds` (create), `…/settle`, `…/cancel`; guarded by `requirePermission('create','Refund')`. The create route **requires** an idempotency key; settle/cancel accept one optionally (409 is the real guard against re-execution).
- **Scoped reads** — `GET /:id` and `GET /:id/refunds/:refundId`; no permission guard, scoping delegated to the service layer.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, `requirePermission`, `requireFreshAuth`, which this file applies as per-route middleware (or as a router-level guard for all post-webhook routes).
- **`src/infrastructure/http/middlewares/idempotency.ts`** — provides `idempotencyKey` (optional replay guard on settle/cancel/confirm) and `requireIdempotencyKey` (mandatory, used only on refund creation).
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `noStore` and `privateNoCache` cache-control directives applied to the staff read routes.
- **Controllers** (all under `src/modules/payments/controllers/`) — each route's terminal handler: `postPaymentWebhook`, `getPaymentMethods`, `getPayments`, `getRefunds`, `getPaymentAttention`, `postPaymentConfirm`, `postPaymentSync`, `getPayment`, `getRefund`, `postPaymentRefund`, `postPaymentRefundSettle`, `postPaymentRefundCancel`.

## Notes

- **Route order is load-bearing.** The literal GETs (`/refunds`, `/attention`) must appear before `GET /:id`, or Express will match `:id` first. The webhook and `/methods` must appear before the `getAuth`/`isAuth` guard is attached to the router.
- **`POST /` omits `idempotencyKey` on purpose.** A replayed intent already refreshes the same record; storing the response in the idempotency ledger would persist the `clientSecret`.
- **Refund create uses `requireIdempotencyKey` (mandatory), not the optional `idempotencyKey`.** A retried refund must not re-execute; a key with an unknown outcome returns "outcome unknown" rather than running the action again.
- **`requireFreshAuth` is explicit on customer money routes but *absent* on refund routes.** The `create:Refund` permission key carries `stepUp: critical` in `shared/authorization-keys.generated.yaml`, so the framework enforces the freshness check and audits it without a duplicate middleware call here.
- **`checkout:Cart` is mounted here but owned by the `cart` module**, following the same cross-module permission-mounting pattern as `products/routes.ts` mounting `locales`-owned keys.
- **`paymentIntentLimiter` is shared by `POST /` and `POST /:id/sync`** because both end in a provider API call and should draw from the same per-account budget.
- **`noStore`/`privateNoCache` on staff routes** follows the RFC 9111 §3.5 rule: the response body is shop-wide financial data, never eligible for shared caching.
