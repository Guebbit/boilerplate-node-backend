# src/modules/locales/tests/unit/routes.test.ts

## Purpose

Unit test that pins the locale router's contract: which endpoints exist and in what order, which middleware guards each carries, and how caching is configured. It exists so that accidental "simplifications" (adding a router-level auth gate, reordering paths, dropping `browserRevalidate`, caching the editor screen) fail loudly rather than degrading silently in production.

## Key elements

- **`chainOf(signature)`** — local helper; looks up a route by `"METHOD /path"` string and returns its middleware chain.
- **`PUBLIC`** — array of the four visitor-readable signatures (`GET /`, `GET /tenants`, `GET /:locale/messages`, `GET /:locale`).
- **`ADMIN`** — array of the nine admin-tier signatures (CRUD on locales and entries, plus `GET /:locale/entries`).
- **describe "what is mounted"** — asserts exact route set/order and that `/tenants` precedes `/:locale` (Express first-match rule).
- **describe "authorization"** — asserts public routes carry no `isAuth`/`isAdmin`; `GET /` carries `getAuth` but not `isAuth`; every ADMIN route names all three guards in order; no route escapes both lists.
- **describe "caching"** — asserts `setCache(3600…)` with `tags: ['locales']` and `browserRevalidate: true` on all PUBLIC reads; `GET /:locale/entries` has no cache middleware; all write ADMIN routes call `invalidateCache([locales])`.
- **`jest.mock` for cache middleware** — replaced with `cacheMock()` from test support so chain inspection is deterministic.

## Relationships

- **`src/modules/locales/routes.ts`** — the module under test; the file imports its `router` export and inspects every route's path, method, and middleware chain.
- **`tests/support/routes.ts`** — provides the inspection utilities (`routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`) and `cacheMock()` used throughout; this file is the primary consumer of those helpers.

## Notes

- The test is intentionally written as a *specification*: the file header states that reads are public and guards are per-route by design. Any refactor that "tidies" the router by adding a shared gate will break the per-route guard-order assertions.
- `GET /:locale/entries` is the one ADMIN-listed route that must **not** be cached; it is excluded from the invalidate-cache loop and separately asserted cache-free.
- The `getAuth` on `GET /` is *optional* (no `isAuth` beside it); the test asserts its presence but explicitly forbids `isAuth`, making the asymmetric intent unambiguous.
- Ordering assertion (`/tenants` before `/:locale`) is a guard against Express's first-match behavior; a naive route reorder would silently 404 the tenants endpoint.
