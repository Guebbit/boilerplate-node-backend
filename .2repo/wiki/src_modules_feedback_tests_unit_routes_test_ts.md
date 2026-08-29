# src/modules/feedback/tests/unit/routes.test.ts

## Purpose

Unit tests that pin the **positional** structure of the feedback router: the single public `POST /contact` route must sit *above* the `router.use(getAuth, isAuth, isAdmin)` gate, and every other route must sit *below* it. The tests also verify the exact route table (signatures and order) and the shared cache configuration between the admin listing and search endpoints.

## Key elements

- **`chainOf(signature)`** — local helper that looks up the full middleware chain for a given `"METHOD /path"` string via `routeTable(router)`.
- **`describe('… what is mounted')`** — asserts `routeSignatures(router)` equals exactly `['POST /contact', 'POST /search', 'GET /', 'PUT /:id']` in that order.
- **`describe('… the positional guard')`** — the core suite. Uses `guardsOn` to verify `POST /contact` carries no auth middleware, while `POST /search`, `GET /`, and `PUT /:id` each carry `getAuth` + `isAuth` + `isAdmin`. Includes a sweep test ("guards every route that reads what visitors submitted") that iterates all non-contact signatures, so a future route added below the gate is covered automatically.
- **`describe('… caching')`** — asserts `GET /` and `POST /search` share one `setCache` entry with TTL 600, tag `feedback`, key `feedback:search`, and no `keyParameters=[]`. Asserts `POST /contact` and `PUT /:id` both call `invalidateCache([feedback])`.
- **`jest.mock` for `@infrastructure/http/middlewares/cache`** — replaced with `cacheMock()` (defined in the test-support layer) so that cache calls are inspectable as strings in the chain rather than invoking a real store.

## Relationships

- **`src/modules/feedback/routes.ts`** — the unit under test. The test imports `router` and reads its route table, middleware chains, and ordering.
- **`tests/support/routes.ts`** — supplies the test-infrastructure helpers `routeTable`, `routeSignatures`, `guardsOn`, and `cacheMock` (imported as `@tests/routes`). The tests are written against these abstractions rather than parsing the Express router directly, which is what makes the positional assertions possible.

## Notes

- The suite is deliberately **positional**, not per-route. The file's header comment explains that asserting middleware per route in isolation would pass regardless of *where* the auth gate is mounted; the ordering assertion + guard assertion pair is what actually pins the gate position.
- The cache mock is required before importing the router (`jest.mock` → `import`), so that the cache middleware records its arguments as inspectable strings in the chain.
- The TTL assertion hard-codes `600` (vs. a `3600` used elsewhere in the codebase) because the operator queue changes while it is being read; changing the TTL in `routes.ts` without updating this test will break the build.
