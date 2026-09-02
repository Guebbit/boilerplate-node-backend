# tests/contract/authorization-contract.test.ts

## Purpose

Contract-derived authorization sweep that generates one table-driven case per route (via `everyMountedRoute()`) asserting: every `isAuth`-guarded route returns **401** to an unauthenticated caller, and every `isAdmin`-guarded route returns **403** to an authenticated non-admin. Each response is also validated against the OpenAPI error contract via `toSatisfyApiSpec()`. It is the authorization mirror of `request-contract.test.ts`, which sweeps request bodies instead.

## Key elements

- **`fillParams(path)`** — Replaces every `:param` segment with `PLACEHOLDER_ID` (a 24-char zero string) so the path is syntactically valid but resolves to a nonexistent entity.
- **`request(method, path)`** — Type-safe switch over the five HTTP verbs, dispatching through the shared `api()` supertest agent.
- **`SPEC_GAP_403`** — A `Set<string>` of three `DELETE`/`PUT` product routes where `isAdmin` is wired but `openapi.yaml` omits the 403 response. Excluded from the admin sweep; tracked as a known spec gap (cross-repo fix pending).
- **`describe("…caller…")`** — Filters routes with `isAuth` guard; for each, asserts `401` + spec conformance with no auth header.
- **`describe("…admin…")`** — Filters routes with `isAdmin` guard (minus `SPEC_GAP_403`); for each, authenticates as `user` and asserts `403` + spec conformance.

## Relationships

- **`tests/support/contract-routes.ts`** — Provides `everyMountedRoute()`, the single source of truth for which routes exist and which guards (`isAuth`, `isAdmin`) are attached to each.
- **`tests/support/contract.ts`** — Registers the `toSatisfyApiSpec()` Jest matcher that validates responses against `openapi.yaml`.
- **`tests/support/http.ts`** — Supplies `api()` (supertest agent against the test server) and `authenticateAs()` (obtains a bearer token for a given fixture user).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision the database before any route test runs.

## Notes

- Path parameters are filled with a **nonexistent** id deliberately: the authorization guard executes before per-field validation (the `applies` → `chain` order in `@tests/routes`), so the id's resolvability must not influence the 401/403 outcome. A route where it *did* influence the outcome is a defect this sweep is designed to catch.
- `SPEC_GAP_403` is a **deliberate exclusion**, not a skip: those routes still exist and are still guarded, but asserting 403 + spec conformance would fail because the spec is incomplete. Fixing the spec requires forking the shared bundle in `boilerplate-vue-frontend`, which is out of scope for this suite.
- The file is fully data-driven: adding a new `isAuth`/`isAdmin` route automatically adds a test case with no per-module test file needed.
