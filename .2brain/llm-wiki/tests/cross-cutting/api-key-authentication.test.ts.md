---
source: tests/cross-cutting/api-key-authentication.test.ts
sha256: 1a9d7e1d97a037a7d0dac1d9187a5150bfbf830f80798e8a0fd706528facbf7b
generated_at: 2026-09-23T19:53:02.588858+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/api-key-authentication.test.ts

## Purpose

Proves the middle link in the credential-authentication chain: that a real `sk_...` secret, sent as a Bearer token, actually clears the identity guard on the mounted Express chain and reaches (or is refused by) the permission check on the other side. It also enforces, at the source level, that no module accidentally mounts both identity guards (`isAuth` and `isAuthOrCredential`), which would make credential-acceptance a per-route accident rather than a module-level property.

## Key elements

- **`credentialHolding(permissions)`** — Mints a real API-key credential via `mint()` under a caller context that genuinely holds the given permissions. Returns the plaintext `sk_...` secret.
- **`codeOf(file)`** — Reads a source file and strips all comment lines, so the guard-split regex only sees executable code.
- **`describe('an api key over the real chain')`** — Five integration tests driving real HTTP requests through the mounted Express app: 200 on a covered route, 403 on an uncovered route, 401 on caller-subject routes (`/cart`, `/account`, `/account/sessions`), 401 on a bogus secret, and 401 when a credential tries to mint another credential.
- **`describe('the guard split')`** — Iterates every `src/modules/*/routes.ts`, asserts that no single file contains both `isAuth` and `isAuthOrCredential` as mounted guards.
- **`MODULES_ROOT`** — Resolved path to `src/modules`, used to discover route files for the guard-split check.

## Relationships

- **`tests/support/http.ts`** — Provides the `api()` helper that issues requests against the mounted Express app.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to prepare the test database.
- **`src/modules/api-keys/module.ts`** — Imported purely for its side effect (`registerCredentialResolver`); without it, `resolveCredential` has no registered resolver and no credential can authenticate.
- **`src/modules/api-keys/services/api-keys.ts`** — Supplies `mint()`, the real credential-minting service used by `credentialHolding`.
- **`src/modules/users/tests/factories.ts`** — Supplies `createUser()` to produce a verified admin user who can mint credentials.
- **`src/kernel/access/tenant.ts`** — Exports `DEPLOYMENT_TENANT_ID`, the tenant ID that `createUser` actually writes the minter's membership under.
- **`src/types/index.ts` / `src/types/auth-context.ts`** — Provide the `TenantCallerContext` type used to construct the minting caller context.

## Notes

- **Tenant-ID mismatch is a silent 403.** The caller context must use `DEPLOYMENT_TENANT_ID` (what `createUser` persists), not `TEST_TENANT_ID`. A mismatch causes `resolveCredential` to re-read the minter's membership and find nothing, producing a 403 that looks like a guard bug but is actually a setup error.
- **403 vs 401 is intentional and load-bearing.** A 403 means the identity guard passed and the permission check failed. A 401 means the identity guard itself rejected the credential. The tests assert the correct code to keep the two guards' responsibilities distinguishable in CI.
- **Guard-split test reads source, not requests.** It is a file-level invariant (no module mounts both guards). It uses `codeOf` to strip comments because modules like `orders` and `api-keys` document _why_ they deliberately omit a guard in a comment that names the guard; a raw-text match would flag those as violations.
- **The "cannot mint with a credential" test is a policy assertion.** `api-keys` routes are behind `isAuth` (session-only), so a credential gets 401. The test documents that this is a deliberate decision (credentials that can mint credentials never need rotation), not an accidental gap.
