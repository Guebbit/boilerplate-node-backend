---
source: src/modules/payments/routes.ts
source_sha256: 90c61ceb63dac49e6fbdf362f86e46149daab04e79ec86a1704bdaf9d20dd50a
context_sha256: c102983cf86be9784852e64fd5b71043730ca1aecc9143ffa0f52428c530c0fc
generated_at: 2026-11-22T06:48:59.215899+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/routes.ts

## Purpose
Defines the Express router for the payments module. It declares every payment route (intent, confirm, sync, refunds, staff listings, read-backs, webhook) and the order of guards on each. Two routes are public and sit above the auth wall: the provider webhook and `GET /methods`. Everything after that is authenticated.

## Key elements
- `router` — the exported Express `Router`.
- **Above the auth wall**
  - `POST /webhook/:provider` — provider callback. Uses `webhookLimiter` and has no session auth (the caller signs the raw body).
  - `GET /methods` — `environmentCache` + `getPaymentMethods`. Public pre-purchase information.
- **Auth wall:** `router.use(getAuth, isAuth)`.
- **Staff reads** (`requirePermission('display', 'Payment')`, never shared-cached):
  - `GET /` → `getPayments` (`privateNoCache`)
  - `POST /search` → `getPayments` (`noStore`)
  - `GET /refunds` → `getRefunds`
  - `GET /attention` → `getPaymentAttention`
- **Customer routes** (`checkout:Cart` + `requireFreshAuth('critical')`):
  - `POST /` → `postPayment`, behind `paymentIntentLimiter`. No idempotency key.
  - `POST /:id/confirm` → `postPaymentConfirm`. Chain: the three confirm velocity limiters (attempt, decline, decline-block), then `paymentDeclineChallengeGate`, then `idempotencyKey`.
  - `POST /:id/sync` → `postPaymentSync`, behind `paymentIntentLimiter`. No idempotency key.
- **Refund routes** (`create:Refund`):
  - `POST /:id/refunds` → `postPaymentRefund`, with `requireIdempotencyKey({ operation: 'refund', subjectParam: 'id' })`.
  - `POST /:id/refunds/sync` → `postPaymentRefundsSync`. No key.
  - `POST /:id/refunds/:refundId/settle` → `postPaymentRefundSettle`, with optional `idempotencyKey`.
  - `POST /:id/refunds/:refundId/cancel` → `postPaymentRefundCancel`, with optional `idempotencyKey`.
- **Read-back routes:** `GET /:id` → `getPayment` and `GET /:id/refunds/:refundId` → `getRefund`. Neither has a permission guard.

## Relationships
- `src/kernel/middlewares/authorizations.ts` supplies `getAuth`, `isAuth`, `requirePermission` and `requireFreshAuth`.
- `src/infrastructure/http/middlewares/idempotency.ts` supplies `idempotencyKey` (optional) and `requireIdempotencyKey` (mandatory, used for refund creation).
- `src/infrastructure/http/middlewares/cache.ts` supplies `environmentCache`, `noStore` and `privateNoCache`.
- Each route maps to a handler in `src/modules/payments/controllers/*`: `get-payments`, `get-payment`, `get-payment-methods`, `get-payment-attention`, `get-refunds`, `get-refund`, `post-payment-confirm`, `post-payment-sync`, `post-payment-refund`, `post-payment-refund-settle`, `post-payment-refund-cancel` and `post-payment-refunds-sync`. The `post-payment` and `post-payment-webhook` handlers and the `./rate-limits` limiters are also imported here.

## Notes
- **Order matters.**
  - The webhook and `/methods` must stay above `router.use(getAuth, isAuth)`.
  - `GET /:id` is declared after the literal GETs (`/refunds`, `/attention`) so it doesn't swallow them.
  - `/:id/refunds/sync` is declared before the `/:id/refunds/:refundId/...` routes.
- **Step-up on refunds.** Refund routes have no explicit `requireFreshAuth`. The `create:Refund` key carries `stepUp: critical` in `shared/authorization-keys.generated.yaml`, so the guard enforces it.
- **Idempotency.** `POST /` and `/sync` skip the key because they are idempotent by construction. `POST /:id/refunds` requires it, because a retry would otherwise refund twice. Settle and cancel use the optional key and rely on the record returning 409 on a repeat.
- **Fresh-auth order.** `requireFreshAuth` is asked after the permission key it sits beside, so a caller who can never pass is refused rather than challenged.
- **Card-testing budgets** apply only to `POST /:id/confirm`, because that is where the card is validated.
- **Cache headers.** Staff listings are never shared-cached. The `POST /search` route uses `noStore`, following the POST rule in RFC 9111 §3.5.
- **Scoped reads.** `GET /:id` and `GET /:id/refunds/:refundId` are scoped in the service. A stranger's record returns the same 404 as a missing one.
- The header comment mentions that the admin-only order payment record route lives in a separate `./order-routes.ts`; it is not mounted in this file.
