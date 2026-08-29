# src/modules/locales/tests/unit/routes.test.ts

## Purpose

Unit test for the locales Express router. It locks in three invariants that are easy to break during refactoring: the exact set and order of mounted routes, the per-route authorization guard chain (public reads carry no auth guard; admin writes carry all three in order), and the caching contract (shared Redis cache with 1-hour TTL and `browserRevalidate` on public reads, no cache on the editing screen, tag invalidation on every write). The file header explains *why* the two design choices it guards exist, so a future "cleanup" that inverts them fails loudly.

## Key elements

- **`PUBLIC`** – Array of four route signatures (`GET /`, `GET /tenants`, `GET /:locale/messages`, `GET /:locale`) representing the anonymous-facing reads.
- **`ADMIN`** – Array of nine route signatures covering all writes plus the two admin-only reads (`GET /:locale/entries`, `GET /:locale/entries/:entryId`).
- **`chainOf(signature)`** – Helper that resolves a `"METHOD /path"` string to its full middleware chain via `routeTable`.
- **`routeTable`, `routeSignatures`, `guardsOn`** – Test utilities imported from `@tests/routes`; they introspect the Express router's internal stack to extract paths, method+path pairs, and named guards without issuing HTTP requests.
- **`jest.mock('@infrastructure/http/middlewares/cache', …)`** – Replaces the real cache middleware with `cacheMock()` so the test can assert on its invocation arguments (TTL, tags, `browserRevalidate`) in the chain.
- **Three `describe` blocks** – "what is mounted", "authorization", "caching" — each group asserts one dimension of the router contract.
- **"Ungoverned" sweep test** – Filters all mounted signatures for any that are neither in `PUBLIC` nor carry `isAdmin`; asserts the result is empty. Catches routes added later with no guard at all.

## Relationships

- **`src/modules/locales/routes.ts`** – The module under test. Exports `router`; this test file imports it and asserts on its route table, guard chains, and cache middleware invocations.
- **`tests/support/routes.ts`** – Provides the three introspection utilities (`routeTable`, `routeSignatures`, `guardsOn`) and the `cacheMock` factory used by the jest mock. Without this helper the test would need to walk Express's internal `router.stack` directly.

## Notes

- `GET /` is the one public route that includes `getAuth` (to list inactive languages for an admin's manifest) but must **not** include `isAuth`. The test asserts both conditions explicitly; adding `isAuth` here would break anonymous access.
- Route order is part of the contract: `/tenants` must appear before `/:locale` in the stack, otherwise Express matches `tenants` as a locale code and the tenants endpoint 404s.
- There is deliberately no `router.use(isAuth, isAdmin)` gate. Each admin route declares all three guards inline in the order `getAuth → isAuth → isAdmin`. The per-route ordering is asserted with `indexOf` comparisons.
- The cache test for `GET /:locale/entries` asserts the route has **no** `setCache` call at all — it is the editing screen and must always be fresh.
- `browserRevalidate=true` is asserted on every public cached route so a translator's browser doesn't serve a stale copy after Redis is invalidated.
