---
source: src/modules/payments/tests/unit/routes.test.ts
sha256: ba1067c0ae2b865547b94160dddc045c0a7772f92c652b9fda688e3583897b26
generated_at: 2026-10-29T05:24:17.595114+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/routes.test.ts

## Purpose

Verifies the structural and security contract of the payments HTTP route table: exact endpoint ordering, which routes sit above vs. below the auth wall, which carry admin vs. shopper permissions, and that guard lists (rate-limiters, idempotency, session checks) are attached to the right routes. It exists so a silent reordering or missing guard — neither of which throws at runtime — is caught at test time.

## Key elements

- **`WEBHOOK` / `METHODS`** – String constants for the two routes declared *above* the auth wall (`POST /webhook/:provider`, `GET /methods`). Used to assert their position and absence of session guards.
- **`INTENT_BUDGET`** (`'payments-intent-sync'`) – Name of the pooled per-account rate-limit shared by `POST /` and `POST /:id/sync`.
- **`withoutHandler(signature)`** – Calls `guardsOn(router, signature).slice(0, -1)` to strip the route handler so two routes' guard arrays can be compared with `toEqual`.
- **`jest.mock('@infrastructure/http/middlewares/rate-limit', …)`** – Replaces the real rate-limit middleware with `securityMock()` from test support so guard names are inspectable strings.
- **`describe('payment routes', …)`** – Eight `it` blocks covering: endpoint order, session-guard presence on all non-public routes, webhook/methods being unauthenticated, webhook rate-limit, webhook declared first, admin-guarded route set, sync-vs-confirm guard parity, pooled budget on intent/sync (and absence of `idempotencyKey` there), and the order-router payment door.

## Relationships

- **`src/modules/payments/routes.ts`** – Source of `router`; every assertion in the main `describe` block inspects this router's signatures, guards, and permissions.
- **`src/modules/payments/order-routes.ts`** – Source of `orderRouter`; the final test block asserts its two endpoints, their order, and their exact guard stacks.
- **`tests/support/routes.ts`** – Provides the `routeSignatures`, `routeTable`, and `guardsOn` utilities used throughout, plus the `securityMock` factory consumed by the `jest.mock` call.

## Notes

- **Order is the mechanism.** `router.use(getAuth, isAuth)` applies to every route declared *after* it. Moving the webhook below that line would silently break provider deliveries with no error. The test pins `WEBHOOK` to index 0 for this reason.
- **Guard comparison is list-wise, not name-wise.** `requireFreshAuth(…)` is a closure with no stable name, so the test asserts whole-array equality (`toEqual`) rather than checking individual guard identifiers.
- **Admin routes are identified by exclusion.** The test filters out the two shopper permissions (`update:Cart`, `checkout:Cart`) and treats every remaining permission-bearing route as admin-guarded. Adding a new shopper permission without updating this set will cause a failure.
- **`POST /:id/sync` deliberately lacks `idempotencyKey`.** It is idempotent by construction (keyed on the provider's payment reference). The test asserts its absence explicitly to prevent accidental addition.
