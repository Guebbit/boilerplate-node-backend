---
source: tests/cross-cutting/api-key-authentication.test.ts
sha256: 703bc71e4104bf658795bf3c824539a79f972b6dadba98a7f52881ec0d8cbf21
generated_at: 2026-09-27T15:48:58.949089+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/api-key-authentication.test.ts

## Purpose

Cross-cutting integration test proving that a real `sk_...` API-key credential clears the identity guard (`isAuthOrCredential`) on the actual mounted Express chain and is then admitted or refused by the downstream permission check. It also enforces, at the source level, that no module mounts *both* `isAuth` and `isAuthOrCredential`—keeping "which routes accept credentials" a per-module decision rather than an accidental line-ordering artifact.

## Key elements

- **`credentialHolding(permissions)`** – Creates a verified admin user, builds a `TenantCallerContext` (scoped to `DEPLOYMENT_TENANT_ID`), and calls the real `mint` service to produce a live secret with exactly the given permissions.
- **`codeOf(file)`** – Reads a source file and strips all comment lines so the guard-split regex doesn't match guard names mentioned only in prose.
- **`describe('an api key over the real chain')`** – Five integration tests over the live HTTP chain: 200 on a permitted route, 403 on a non-permitted route, 401 (never 500) on caller-subject routes (`/cart`, `/account/sessions`, `/account`), 401 for an unknown secret, and 401 when attempting to mint a second key via a credential.
- **`describe('the guard split')`** – Iterates every `MODULES_ROOT/*/routes.ts`, strips comments, and asserts that `isAuth` and `isAuthOrCredential` do not co-occur in the same file.

## Relationships

- **`src/kernel/access/tenant.ts`** – Imports `DEPLOYMENT_TENANT_ID`; the minter's tenant membership is written under this constant, and the credential context must use it (not a test-only tenant) or `resolveCredential` resolves to zero permissions.
- **`src/modules/api-keys/services/api-keys.ts`** – Imports `mint` to produce a genuine secret that `resolveCredential` will recognise.
- **`src/modules/users/tests/factories.ts`** – Imports `createUser` to create the verified admin who is the minter of record.
- **`src/types/index.ts`** – Re-exports `TenantCallerContext` used to build the minter's auth context.
- **`tests/support/http.ts`** – Provides the `api()` helper that sends real HTTP requests through the mounted Express app.
- **`tests/support/paths.ts`** – Provides `MODULES_ROOT` used by the guard-split scan to discover route files.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory database before any test runs.

## Notes

- The tenant ID in the minter context **must** be `DEPLOYMENT_TENANT_ID`, not a test-scoped tenant. A mismatch causes `mint` to succeed but `resolveCredential` to return empty permissions, surfacing as a confusing 403.
- 403 vs 401 distinction is deliberate: 403 means the credential authenticated but lacks the key; 401 means the identity guard itself rejected it. A 401 where 403 is expected (or vice versa) signals a guard-misrouting bug.
- Caller-subject routes (`/cart`, `/account`) assert **401, never 500**—the invariant is that a credential must not leak through to a controller that does `request.authContext!.id`.
- The guard-split test is source-level (regex over `routes.ts`), not request-level, because a request test can only reach routes someone already added; the regex catches the structural invariant as new routes appear.
- `codeOf` strips comment lines specifically because modules like `orders` and `api-keys` document *why* they chose a guard in prose; a raw-text match would flag those deliberate decisions as violations.
