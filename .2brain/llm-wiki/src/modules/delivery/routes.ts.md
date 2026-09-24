---
source: src/modules/delivery/routes.ts
sha256: 5603e409255a808367cbdfa7659ae9a099bb754f6ed55478d797a0220b9ce6c1
generated_at: 2026-09-23T18:37:15.455270+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/routes.ts

## Purpose

Defines the Express route table for the delivery module. It wires four endpoints (shipping-methods lookup, shipment read, ship, deliver) to their controller handlers and attaches per-route authorization guards. The file exists to centralize URL patterns, guard selection, and handler binding so `module.ts` can mount a single router.

## Key elements

- **`router`** (exported `Router`) — the sole export; an Express `Router` instance with four routes registered on it.
- **`GET /methods`** — public; delegates to `getShippingMethods` (no auth middleware).
- **`GET /order/:orderId`** — requires `getAuth` → `isAuth`; delegates to `getShipmentByOrder`.
- **`POST /order/:orderId/ship`** — requires `getAuth` → `isAuth` → `requirePermission('delivery.any.update')`; delegates to `postShipOrder`.
- **`POST /order/:orderId/deliver`** — requires `getAuth` → `isAuth` → `requirePermission('delivery.any.update')`; delegates to `postDeliverOrder`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — source of the three guard functions (`getAuth`, `isAuth`, `requirePermission`) applied to every non-public route.
- **`src/modules/delivery/controllers/get-shipping-methods.ts`** — handler for `GET /methods`.
- **`src/modules/delivery/controllers/get-shipment-by-order.ts`** — handler for `GET /order/:orderId`.
- **`src/modules/delivery/controllers/post-ship-order.ts`** — handler for `POST /order/:orderId/ship`.
- **`src/modules/delivery/controllers/post-deliver-order.ts`** — handler for `POST /order/:orderId/deliver`.
- **`src/modules/delivery/module.ts`** — imports and mounts `router` into the application.
- **`src/modules/delivery/tests/unit/routes.test.ts`** — unit-tests the route table, guards, and handler bindings defined here.
- **`tests/support/routed-modules.ts`** — test-harness helper that registers this module's router alongside others for integration-style tests.

## Notes

- Guard asymmetry is intentional: `GET /methods` carries **no** auth middleware (pre-purchase info), while the other three routes all pass through `getAuth` + `isAuth`. The two `POST` routes add a `requirePermission` check (`delivery.any.update`) on top of the same auth pair — there is no separate "staff" token; the permission string is the differentiator.
- Route order matters in Express: the literal `/methods` is registered before the parameterised `/order/:orderId` paths, so there is no collision, but inserting a new static path after the parameterised ones would be silently shadowed.
- The module docstring references `docs/modules/delivery.md` for design rationale; see that doc for the state-transition model (processing → shipped → delivered) that the two POST endpoints encode.
