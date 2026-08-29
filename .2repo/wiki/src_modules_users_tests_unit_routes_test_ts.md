# src/modules/users/tests/unit/routes.test.ts

## Purpose

Verifies the user-administration route table for three properties: that the exact set and order of endpoints is correct, that every endpoint carries the full `getAuth → isAuth → isAdmin` guard chain in that order, and that caching/upload/flag middleware is attached where expected. It exists because a single misplaced or missing line in `routes.ts` (e.g. a route mounted above the admin `use`, a dropped `isAdmin`, a forgotten cache-invalidation tag) would silently expose every user's email to non-admins or serve stale data.

## Key elements

- **`ALL`** — array of the nine endpoint signatures (`POST /search`, `GET /`, `POST /`, `PUT /`, `DELETE /`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `DELETE /:id/hard`). Drives the `it.each` loops and the "exactly these, in this order" assertion.
- **`chainOf(signature)`** — helper that looks up the middleware chain for one endpoint via `routeTable` from the test-support module.
- **`describe('what is mounted')`** — asserts the signature list matches `ALL` exactly and that `/search` precedes `/:id` (otherwise the parameter route would shadow it).
- **`describe('authorization')`** — for every signature, asserts all three guards are present *and* in order; additionally asserts zero endpoints lack `isAdmin` (catches a "harmless" public read mounted above the gate).
- **`describe('caching and uploads')`** — checks shared cache key/tag for the two listings, the single-read tag, dual-tag invalidation (`[users|account]`) on every mutating endpoint, the three-step image-upload chain on `POST /`, `PUT /`, `PUT /:id`, and that `routeFlag(hardDelete)` guards only `DELETE /:id/hard`.

## Relationships

- **`src/modules/users/routes.ts`** — the module under test; this file imports its exported `router` and inspects its route table.
- **`tests/support/routes.ts`** — provides the test utilities consumed here: `routeTable`, `routeSignatures`, `guardsOn` (used directly) and `cacheMock`, `routeFlagMock`, `storageMock` (referenced through the three `jest.mock` factories).

## Notes

- The `jest.mock` calls use `jest.requireActual<typeof import('@tests/routes')>` to pull the mock factories from the *real* `tests/support/routes` module rather than a re-mocked one. A typo in the factory name will fail at setup time, not at assertion time.
- Per-endpoint guard assertions (rather than a single `expect(routerMiddleware(...))`) are deliberate: they fail if a future route is mounted *above* the shared `router.use(getAuth, isAuth, isAdmin)` line, a scenario a single-chain assertion would miss.
- The "no public endpoint" test is the safety net for the specific regression class where someone adds a public read above the admin gate; it is the only test that would catch that if the `it.each` guard tests were accidentally skipped.
