# src/modules/inventory/tests/unit/routes.test.ts

## Purpose

Unit test suite that pins the inventory route table to its documented contract: exactly five endpoints in a fixed order, each guarded by the full `getAuth → isAuth → isAdmin` chain, and zero public routes. It exists to catch the specific, severe regression where a route is accidentally mounted above the guard or a guard is dropped, which would expose inventory counters and movement ledgers to non-staff clients.

## Key elements

- **`describe('inventory routes')`** — top-level suite; no setup/teardown hooks.
- **`it('mounts exactly the documented endpoints…')`** — asserts `routeSignatures(router)` equals the five-verb/path list in order. Order matters: a reordering here signals a structural change in `routes.ts`.
- **`it.each([...])('%s is reachable only by an authenticated admin')`** — parameterised over the five signatures; asserts each route's guard list contains `getAuth`, `isAuth`, `isAdmin`, and that `isAuth` precedes `isAdmin` (positional check).
- **`it('has no public endpoint at all')`** — filters signatures whose guard list lacks `isAdmin` and expects an empty array. The comment notes this is the positional check that fires if a route is ever mounted above the `use(getAuth, isAuth, isAdmin)` gate.

## Relationships

- **`src/modules/inventory/routes.ts`** — the system under test; the suite imports its exported `router` instance and inspects its route table and middleware stack.
- **`tests/support/routes.ts`** — provides the two test helpers: `routeSignatures(router)` (returns ordered `"METHOD /path"` strings) and `guardsOn(router, signature)` (returns the ordered list of guard function names applied to a given route).

## Notes

- The import specifier for the helpers is `@tests/routes`, not `@modules/…`; this is the repo's alias for the `tests/support/` directory.
- The guard-order assertion (`indexOf('isAuth') < indexOf('isAdmin')`) is intentional: `isAuth` must run before `isAdmin` because `isAdmin` presumably depends on the session set by `isAuth`.
- The module-level comment in `routes.ts` (quoted in the file's docblock) makes explicit that customer-facing stock visibility is *not* a route here — it is surfaced via the product's `available` field. This test therefore also implicitly guards against someone adding a public `/inventory` route by mistake.
