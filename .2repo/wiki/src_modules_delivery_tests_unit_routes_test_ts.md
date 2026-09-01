# src/modules/delivery/tests/unit/routes.test.ts

## Purpose

Unit-test suite that pins the delivery module's route table: the exact set of endpoints, their order, and the per-route authentication guard on each. It exists to catch drift — especially a new route added without a guard — before it ships open.

## Key elements

- **Route-signature test** — asserts `routeSignatures(router)` equals `['GET /methods', 'GET /order/:orderId', 'POST /advance']` in that exact order.
- **Public guard test (`GET /methods`)** — verifies the route carries no `isAuth` guard, keeping shipping-method pricing visible to unauthenticated shoppers.
- **Session guard test (`GET /order/:orderId`)** — asserts `isAuth` is present and `isAdmin` is absent; ownership logic is delegated to the controller, this test only checks the gate.
- **Admin guard test (`POST /advance`)** — asserts `isAdmin` is present, since this endpoint advances every parcel (operator/cron action).
- **Sweep test** — filters all routes lacking `isAuth` and asserts the result is exactly `['GET /methods']`. Any future route added without a guard fails this test.

## Relationships

- **`src/modules/delivery/routes.ts`** — source of the `router` object under test; the file under inspection.
- **`tests/support/routes.ts`** — provides the `routeSignatures(router)` and `guardsOn(router, signature)` helpers used by every assertion in this file.

## Notes

- Guards are **per-route**, not an inherited default. The file's own comment calls this out as the most likely drift vector: a fourth route added to `routes.ts` silently has no guard unless the sweep test is updated.
- The sweep test is the primary safety net; it is intentionally a *closed-world* assertion (the open set must equal exactly one entry), not an "at least" check.
- This suite checks **route-level** guards only. It does not (and cannot) verify controller/service-level ownership checks like "user owns this orderId."
