---
source: tests/cross-cutting/identity-guards-follow-the-spec.test.ts
sha256: 97516ddf48ece246b6cb4da5ec7d5b997d4e27b2d90d567dfd2c1bf97ae2a33a
generated_at: 2026-10-29T06:46:29.111578+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/identity-guards-follow-the-spec.test.ts

## Purpose

Cross-checks that the route table's identity guards and the bundled OpenAPI spec's `security` field agree in **both** directions: a route the spec marks as needing a credential must mount the guard, and a route that mounts a guard must be named in the spec. It also verifies that the non-identity guards (`cookieAuth`, `metricsBearer`) are mounted only when the spec names that scheme and the credential is not optional. Runs in the commit gate and under Stryker with no database dependency.

## Key elements

- **`GUARD_OF_SCHEME`** — maps the two non-identity credential schemes (`cookieAuth`, `metricsBearer`) to the guard function names that enforce them.
- **`IDENTITY_SCHEMES`** — the set (`bearerAuth`, `apiKeyAuth`) whose enforcement is checked via `identityGuardIndex` rather than a named guard string.
- **`Access`** — per-operation record with `optional` (public or credential-optional) and `schemes` (all scheme names across alternatives).
- **`spec` / `accessByOperation`** — parses `openapi.yaml` at repo root into a `Map<"METHOD /path", Access>`.
- **`operationOf(route)`** — normalises a `MountedRoute` path (`:param` → `{param}`, strips trailing `/`) so it matches the spec's key spelling.
- **`APP_LEVEL_OPERATIONS`** — the four routes registered in `src/app.ts` outside module routers; expected to be the *only* spec operations absent from the route table.
- **`describe` block** — two tests: (1) a bidirectional completeness check (no undocumented, no unmounted except the app-level set, exact count), and (2) an `it.each` over every mounted route asserting the correct guard is present/absent.

## Relationships

- **`tests/support/contract-routes.ts`** — supplies `everyMountedRoute()` (the full list of mounted routes) and the `MountedRoute` type used to read each route's `guards` array.
- **`tests/support/paths.ts`** — supplies `REPO_ROOT` so the test can locate `openapi.yaml` without assuming CWD.
- **`tests/support/routes.ts`** — supplies `identityGuardIndex(guards)`, which returns the index of the first identity guard in a route's guard list (−1 if none), used to assert presence/absence without hard-coding the guard name.

## Notes

- `security: []` means public; an empty alternative object `{}` inside the alternatives array makes the credential **optional** (a request with no credential is still a valid shape). Both cases result in `optional: true` and require *no* guard.
- The completeness test asserts an **exact** count (`mounted.length + APP_LEVEL_OPERATIONS.length === accessByOperation.size`), not merely "no extras," so a missed operation in the walk fails the suite.
- Stryker cannot detect a guard silently dropped from a route (no mutator removes a single array element in this shape), which is one reason this cross-cutting test exists alongside `tests/contract/authorization-contract.test.ts`.
- The doc-header references `tests/contract/authorization-contract.test.ts` as the complementary test that selects routes *by* the guard; this file selects them *by the spec*.
