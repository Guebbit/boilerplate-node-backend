# src/modules/feedback/tests/unit/routes.test.ts

## Purpose

Unit tests that pin the structural contract of the feedback router: the exact endpoint list and order, the positional auth guard (`router.use(getAuth, isAuth, isAdmin)`) that makes every route below it admin-only, and the shared cache key/TTL/tag for the read-and-write pair. The file exists because the auth gate is purely positional—per-route middleware alone would not catch a misplaced `router.use`—so these assertions act as a combined positional + guard check.

## Key elements

- **`chainOf(signature)`** (local helper) — looks up the middleware chain for a given `"METHOD /path"` signature via `routeTable(router)`.
- **`describe('…what is mounted')`** — asserts the exact, ordered list of four route signatures: `POST /contact`, `POST /search`, `GET /`, `PUT /:id`.
- **`describe('…the positional guard')`** — verifies `POST /contact` has no `isAuth`/`isAdmin`, the other three routes have all three guards, and `POST /contact` is first in the table (so the gate cannot be accidentally moved above it). A sweep assertion ensures every non-contact route carries `isAdmin`.
- **`describe('…caching')`** — asserts `GET /` and `POST /search` share one `setCache` entry with TTL 600, tag `['feedback']`, key `feedback:search`, and non-empty `keyParameters`; asserts `POST /contact` and `PUT /:id` both call `invalidateCache([feedback])`.
- **Jest mock** of `@infrastructure/http/middlewares/cache` using `cacheMock()` from `@tests/routes`, so the router's cache calls are observable as string signatures.

## Relationships

- **`src/modules/feedback/routes.ts`** — the module under test; this file imports its `router` export and asserts on its mounted chain.
- **`tests/support/routes.ts`** — provides the test utilities (`routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`, `cacheMock`) that make the assertions inspectable without hitting the network. The jest mock also delegates to this file's `cacheMock`.

## Notes

- The test pairs an *ordering* assertion (contact is first) with a *guard* assertion (contact lacks `isAuth`) intentionally—either alone is insufficient to catch the "gate moved above contact" regression; both together pin it.
- Cache TTL is asserted as `600` (seconds), explicitly distinguished from the `3600` used by the catalogue module, because the operator queue changes while it is being read.
- The `readsSubmissions` sweep (`routeSignatures.filter(≠ POST /contact)`) means any future route added below the gate is automatically covered, but one added above it fails—no manual list update needed.
