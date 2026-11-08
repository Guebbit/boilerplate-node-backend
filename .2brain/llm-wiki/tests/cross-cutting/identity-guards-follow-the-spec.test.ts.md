---
source: tests/cross-cutting/identity-guards-follow-the-spec.test.ts
sha256: 44a00e30e68f1a78832413d7775d92fc03cc3b3add81c1c5b9a0d524884992d6
generated_at: 2026-11-08T09:27:23.122641+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/identity-guards-follow-the-spec.test.ts

## Purpose

Bidirectional consistency test: every route the OpenAPI spec marks as requiring a credential must mount the corresponding guard in the route table, and every mounted guard must be justified by the spec. It exists to catch routes that silently lose or gain authorization without a spec change, a failure mode the authorization-contract test (which selects routes *by* guard) cannot detect.

## Key elements

- **`GUARDS_OF_SCHEME`** — Maps the non-identity credential schemes (`cookieAuth`, `metricsBearer`) to the specific guard names that enforce them. Identity schemes are handled separately.
- **`IDENTITY_SCHEMES`** — The set `{'bearerAuth', 'apiKeyAuth'}`; any operation naming one of these must have an identity guard.
- **`accessByOperation`** (Map) — Parsed from `openapi.yaml`; each entry records whether the operation is public/optional and which schemes it names.
- **`operationOf(route)`** — Normalises a mounted route's Express-style path (`:param`) into the spec's brace style (`{param}`) and trims a trailing slash, producing a lookup key.
- **`APP_LEVEL_OPERATIONS`** — The five routes registered in `src/app.ts` outside module routers; expected to appear as "unmounted" in the coverage check.
- **Test 1 – bidirectional coverage** — Asserts no mounted route is missing from the spec, no spec operation is missing a mounted route (except `APP_LEVEL_OPERATIONS`), and the counts add up exactly.
- **Test 2 – per-route guard match** (parameterised) — For each mounted route, asserts `identityGuardIndex` is present iff the spec requires an identity scheme, and that cookie/metrics guards are present iff their scheme is named (and the operation isn't public).

## Relationships

- **`tests/support/contract-routes.ts`** — Provides `everyMountedRoute()` and the `MountedRoute` type; this test consumes the full route table to inspect each route's `guards` array.
- **`tests/support/paths.ts`** — Provides `REPO_ROOT` used to locate `openapi.yaml`.
- **`tests/support/routes.ts`** — Provides `identityGuardIndex`, the shared predicate that determines whether a route's guard list contains an identity guard.

## Notes

- Runs in the commit gate and under Stryker with no database. The doc comment explains that Stryker has no mutator that removes a guard argument from a route, so without this test a dropped guard would go undetected.
- `security: []` in the spec means the operation is public; a single empty alternative `{}` makes the credential *optional* (a no-credential request is still accepted). Both cases must result in **no** guard being mounted.
- The exact-count assertion (`mounted.length + APP_LEVEL_OPERATIONS.length === accessByOperation.size`) ensures the walk is exhaustive; a silent skip in the parser would fail here rather than passing vacuously.
- `APP_LEVEL_OPERATIONS` is a hard-coded canary list: adding a new route in `src/app.ts` without also adding it here (or giving it a spec entry) will fail the coverage test.
- Identity schemes (`bearerAuth`, `apiKeyAuth`) are deliberately **absent** from `GUARDS_OF_SCHEME`; they are checked via `identityGuardIndex` instead, keeping the two guard families independent.
