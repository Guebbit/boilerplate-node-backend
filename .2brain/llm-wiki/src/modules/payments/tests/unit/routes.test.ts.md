---
source: src/modules/payments/tests/unit/routes.test.ts
generated_at: 2026-11-22T07:06:23.422915+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/unit/routes.test.ts

## Purpose
Unit tests that pin the payments route table: which endpoints exist, their order, and which guards (auth, permissions, rate limits, idempotency) sit on each. The tests treat the route table as a security contract. Everything is authenticated at the router level except the provider webhook and `GET /methods`, which are declared above the auth wall.

## Key elements
- `WEBHOOK` (`POST /webhook/:provider`), `METHODS` (`GET /methods`): the two routes deliberately in front of the auth wall.
- `INTENT_BUDGET` (`payments-intent-sync`): the namespace of the rate-limit budget that `POST /` and `POST /:id/sync` share.
- `withoutHandler(signature)`: returns a route's guard list minus the final handler, so two routes' guards can be compared directly.
- `describe('payment routes')` tests:
  - **Route list:** the router mounts exactly 15 endpoints in a fixed order, with the webhook first.
  - **Auth:** every route except the webhook and methods contains `isAuth`. The webhook and methods carry neither `isAuth` nor `getAuth`.
  - **Webhook rate limit:** the webhook carries the `payment-webhook` rate limit.
  - **Webhook position:** the webhook is declared at index 0, before the auth wall. Moving it below the wall would silently break deliveries.
  - **Admin guards:** the only routes with permissions other than the shopper's `checkout:Cart` are the staff reads (`GET /`, `/search`, `/refunds`, `/attention`) and the refund routes (create, sync, settle, cancel).
  - **Sync vs confirm:** `POST /:id/confirm` has the same guards as `POST /:id/sync`, minus `INTENT_BUDGET`, plus the confirm attempt/decline limiters, `paymentDeclineChallengeGate` and `idempotencyKey`. The sync guard prefix is `getAuth`, `isAuth`, `requirePermissionGuard`, `(anonymous)`, `INTENT_BUDGET`.
  - **Intent/sync budget:** `POST /` and `POST /:id/sync` have identical guards, neither has `idempotencyKey`, and confirm does not use `INTENT_BUDGET`.
  - **Order router:** `orderRouter` exposes `GET /:id/payments` (`getAuth`, `isAuth`, `getOrderPayments`) and `POST /:id/payments` (`getAuth`, `isAuth`, `requirePermissionGuard`, `idempotencyKey`, `postOrderPayment`).

## Relationships
- `src/modules/payments/routes.ts`: provides `router`, the main table under test.
- `src/modules/payments/order-routes.ts`: provides `orderRouter`, tested in the last case.
- `tests/support/routes.ts` (`@tests/routes`): supplies the helpers `routeSignatures`, `routeTable`, `guardsOn` and `securityMock`. The file's `jest.mock` of `@infrastructure/http/middlewares/rate-limit` uses `securityMock` as its replacement.

## Notes
- Guards are compared by name. `requireFreshAuth(…)` is an unnamed closure, so it appears as `(anonymous)`. The test compares whole guard lists instead of naming each one.
- `/intent` is deliberately not idempotency-keyed: the ledger would store the response, `clientSecret` included.
- `sync` omits the velocity limiters, the decline challenge gate and `idempotencyKey`. It never accepts a `paymentMethodRef`, and it is idempotent by construction, keyed on the provider's payment reference.
- The admin-guard test only asserts on permissions, not on which role holds them.
