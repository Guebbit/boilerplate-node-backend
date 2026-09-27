---
source: src/modules/delivery/routes.ts
sha256: ccb4f3e8e9f5cc204dde570bef374187c10abdf04bbe741d5dc86013dde64a77
generated_at: 2026-09-27T14:50:54.017435+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/routes.ts

## Purpose

Defines the Express route table for the delivery module. Each endpoint is wired to a controller handler and given a per-route authorization chain, distinguishing public pre-purchase lookups, caller-scoped reads, and staff-only write transitions (start, ship, deliver, fulfill).

## Key elements

- **`router`** (exported) — the `express.Router` instance that `module.ts` mounts into the application.
- **`isForcedRequest`** (module-local) — reads `request.body.forced === true`; used as the predicate for the step-up guard on ship and deliver.
- **`GET /delivery/methods`** → `getShippingMethods` — public, no auth.
- **`GET /delivery/order/:orderId`** → `getShipmentByOrder` — requires `getAuth` + `isAuth`.
- **`POST /delivery/order/:orderId/start`** → `postStartOrder` — `delivery.any.start` permission; no step-up guard.
- **`POST /delivery/order/:orderId/ship`** → `postShipOrder` — `delivery.any.update` + `requireFreshAuthWhen(isForcedRequest, REAUTH_TIME_CRITICAL)`.
- **`POST /delivery/order/:orderId/deliver`** → `postDeliverOrder` — same guard chain as ship.
- **`POST /delivery/order/:orderId/fulfill`** → `postFulfillOrder` — `delivery.any.update`; no step-up guard.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, `requirePermission`, `requireFreshAuthWhen`, and the `REAUTH_TIME_CRITICAL` tier constant; these are composed into each route's middleware chain.
- **`src/modules/delivery/controllers/*.ts`** (six files) — each route's terminal handler; this file is the sole import source that pairs them with their guards.
- **`src/modules/delivery/module.ts`** — imports `router` and mounts it in the app.
- **`src/modules/delivery/tests/unit/routes.test.ts`** — unit-tests the route table (paths, methods, guard ordering).
- **`tests/cross-cutting/step-up-auth-routes.test.ts`** — integration-level test for the `forced` step-up challenge on ship/deliver.
- **`tests/support/routed-modules.ts`** — test-harness helper that registers this router for cross-cutting test setups.

## Notes

- The step-up guard (`requireFreshAuthWhen`) is applied **only** to `ship` and `deliver`. `start` has no `forced` variant, and `fulfill` is a digital-only path with no override gate to bypass, so neither carries the guard.
- `isForcedRequest` inspects `request.body`, not a query parameter or header. A caller who omits `forced: true` will never be prompted for step-up reauth.
- The code comments make explicit that `service.ts`'s own `orders.any.override` permission check *cannot* trigger a step-up challenge; only a route-mounted guard runs before the controller, which is why this concern lives here rather than in the service layer.
- Guard ordering matters: `getAuth → isAuth → requirePermission → (optional step-up) → controller`. The step-up guard is always last before the handler.
