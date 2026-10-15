---
source: tests/support/role-hierarchy-rows.ts
sha256: 1d72a583838e24a11455f5222caad93cea8996a8f9b9ee46b4401e7418add8fe
generated_at: 2026-10-15T13:00:33.111625+00:00
model: ollama:qwen3.8:27b
---

# tests/support/role-hierarchy-rows.ts

## Purpose

Data-driven table of every staff write route the role-hierarchy rank rule covers. Each entry pairs a route name, its permission key, and a `prepare` closure that builds a concrete request targeting a resource owned by a given person. The two cross-cutting suites (`role-hierarchy.test.ts` and `role-hierarchy-routes.test.ts`) consume this single list so they cannot disagree on which routes the rank rule enforces; the route-sweep test additionally validates that the list matches the real `effectiveRouteTable`.

## Key elements

- **`Owner`** (interface) — a user document plus their tenant role (`null` for the platform-only account).
- **`HierarchyRequest`** (interface) — a ready-to-send HTTP request: method, url, optional JSON body, or a multipart upload.
- **`HierarchyUpload`** (interface) — multipart file descriptor (field name + bytes) for routes whose handler reads a file before the rank rule fires.
- **`HierarchyRow`** (interface) — one route entry: `route` name, `key`, optional `keyed` flag, optional `selfRefused` flag (money-movement routes that 403 the owner instead of exempting them), and a `prepare(owner) → HierarchyRequest` factory.
- **`HIERARCHY_ROWS`** (exported `readonly HierarchyRow[]`) — the authoritative list of covered routes across users, orders, delivery, payments, returns, examples, and products.
- **Prepare builders** (internal): `onOrder`, `onUser`, `onDelivery`, `onFulfillmentOrder`, `onShipment`, `onPayment`, `onReturn`, `onExample`, `onExampleCover` — each closes over a URL pattern and returns a `prepare` function.
- **Resource helpers** (internal): `orderOf`, `processingOrderOf`, `returnOf`, `exampleOf` — create the owned resource needed to target a route.

## Relationships

- **`tests/cross-cutting/role-hierarchy.test.ts`** — iterates `HIERARCHY_ROWS`, calls each `prepare`, sends the request through the running app, and asserts rank-rule enforcement.
- **`tests/cross-cutting/role-hierarchy-routes.test.ts`** — compares the set of `route` strings in `HIERARCHY_ROWS` against the live `effectiveRouteTable` to catch unlisted write routes (the "sweep" check).
- **`@modules/access` / `@modules/access/service.ts`** — imports `assignRole`; the rank rule under test lives here.
- **`@modules/users`, `@modules/orders`, `@modules/delivery`, `@modules/products`, `@modules/returns`, `@modules/example`** (factories & models) — each `prepare` builder calls the module's test factories (`createUser`, `createOrder`, `createShipmentFor`, `createProduct`, `returnModel.create`, `createExample`) to build the owned resource the request targets.
- **`@types`** — imports `OrderStatus` used by `processingOrderOf`.

## Notes

- The `route` string in each row must **exactly** match how `effectiveRouteTable` names the route (e.g. `'users PUT /:id'`). The sweep test is name-sensitive; a typo or missing row fails the build.
- New write routes on the seven covered modules must appear either as a row in `HIERARCHY_ROWS` or as an entry in `UNOWNED_WRITES` (referenced in the file's doc comment); the sweep fails until one is added.
- `keyed: false` (e.g. `orders POST /:id/cancel`) means a customer who holds the route's own key still passes — the route mounts no permission or only a `self` key.
- `selfRefused: true` marks money-movement routes (refund, offline capture) where the owner's own resource is **refused** with 403 rather than exempted.
- The `onExampleCover` prepare uses `sharp` to generate a 4×4 solid PNG in-memory because the cover-upload handler reads the file before the rank rule is evaluated.
- `RETURN_POSTAGE_PAYERS[0]` is pulled from `@modules/shop` (referenced in the truncated portion) to satisfy the return model's required postage-payer field.
