# src/modules/inventory/tests/unit/routes.test.ts

## Purpose

Unit test that locks down the inventory router's surface area: it asserts the exact set and order of mounted endpoints, confirms every route sits behind the full admin guard chain (`getAuth` → `isAuth` → `isAdmin`), and guarantees no unguarded (public) route exists. It exists as a regression tripwire so that accidentally mounting a route above the guard or dropping `isAdmin` would fail CI rather than silently expose stock counters and the ledger.

## Key elements

- **`describe('inventory routes')`** — single suite; no nested describes.
- **`it('mounts exactly the documented endpoints, in the documented order')`** — snapshots the five signatures (`GET /levels`, `GET /movements`, `POST /receipts`, `POST /adjustments`, `POST /reservations/sweep`) via `routeSignatures(router)`.
- **`it.each([...])('%s is reachable only by an authenticated admin')`** — parameterised over the same five signatures; asserts `guardsOn(router, sig)` contains all three guard names and that `isAuth` precedes `isAdmin`.
- **`it('has no public endpoint at all')`** — filters `routeSignatures` for any route whose guard list lacks `isAdmin` and expects an empty array; the comment flags this as the positional failure mode (a route mounted above the gate).

## Relationships

- **`src/modules/inventory/routes.ts`** — the file under test. The test imports its `router` export and inspects its mounted routes and middleware; no other interaction.
- **`tests/support/routes.ts`** — supplies the two test helpers `routeSignatures` and `guardsOn` (imported via the `@tests/routes` alias). The test file contains no logic of its own beyond calling these helpers and asserting.

## Notes

- The guard-order assertion (`isAuth` index < `isAdmin` index) is intentionally strict: swapping the two would still "work" at runtime but would reject unauthenticated requests with the wrong status code.
- Route order is part of the contract here; inserting a new endpoint anywhere other than the end will break the first test until the expected array is updated.
- The "no public endpoint" test is redundant with the `it.each` check in a well-formed router, but it catches the specific case of a route mounted *before* the `router.use(...)` guard line, which the per-route check would still pass (the guard simply wouldn't be in that route's chain).
