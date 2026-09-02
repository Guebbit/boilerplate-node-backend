# src/modules/feedback/tests/unit/routes.test.ts

## Purpose

Unit tests that pin the feedback router's mount order, positional auth gate, shared cache key, and rate-limit placement. The file exists because `router.use(getAuth, isAuth, isAdmin)` is a positional guard — nothing in the per-route middleware would reveal a misplacement — so assertions must verify *order + guards* together.

## Key elements

- **`chainOf(signature)`** — local helper that looks up a single route's full middleware chain by its `"METHOD /path"` string.
- **Mock setup** — `jest.mock` replaces `@infrastructure/http/middlewares/cache` and `…/rate-limit` with the `cacheMock()` / `securityMock()` factories from the shared test helper, so chains are inspectable as plain strings.
- **"what is mounted"** — asserts the exact five endpoint signatures and their order.
- **"the positional guard"** — verifies `POST /contact` carries no `isAuth`/`isAdmin`, every other route carries all three guards, `POST /contact` is index 0, and a *sweep* assertion catches any future route added below the gate.
- **"caching"** — asserts `GET /` and `POST /search` share the same `setCache(600, …)` entry with tag `feedback` and key `feedback:search`; asserts all three write routes call `invalidateCache([feedback])`.
- **"submission rate limiting"** — asserts `submissionLimiter` appears *before* `invalidateCache` in the contact chain, and that no other route references it.

## Relationships

- **`src/modules/feedback/routes.ts`** — the module under test; this file imports its exported `router` and inspects every aspect of it.
- **`tests/support/routes.ts`** — provides the inspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`) and the mock factories (`cacheMock`, `securityMock`) used to make middleware chains readable as strings.

## Notes

- The guard tests are deliberately paired: the ordering assertion (`POST /contact` is first) *and* the per-route guard assertion together pin the gate position. Either one alone would pass if the `router.use` call were moved.
- `chainOf` uses a non-null assertion (`!`); if a signature is missing the test crashes rather than returning `undefined`, which is intentional for a test file.
- The "sweep" guard assertion (`guards every route that reads what visitors submitted`) is written as a filter over all non-contact routes, so a newly added route below the gate is covered automatically without editing the test.
- Cache TTL is asserted as 600 s (not the 3600 s catalogue convention) because the operator queue is read while actively changing.
