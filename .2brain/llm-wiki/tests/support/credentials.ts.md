---
source: tests/support/credentials.ts
sha256: f76a261b1ef5d1955e3f7ff353ee4e19a805c65b3e120ec234b52b12d89028e6
generated_at: 2026-11-08T09:53:39.643838+00:00
model: ollama:qwen3.8:27b
---

# tests/support/credentials.ts

## Purpose
Test-support helpers that mint **real** `sk_…` API-key credentials (via the production `mint` function) and resolve them back, so integration and contract tests can drive the full authentication chain rather than mocking it.

## Key elements
- **`credentialHolding(permissions: string[]): Promise<string>`** — Creates a verified admin user, arms their authenticator app, builds a `TenantCallerContext`, calls `mint` with those exact permissions and a 7-day expiry, and returns the plaintext secret suitable for an `Authorization: Bearer` header.
- **`credentialOf(secret: string): Promise<ResolvedCredential | undefined>`** — Wraps `resolveCredential`, unwrapping the `{ ok }` envelope so callers get the resolved credential directly (or `undefined` if the secret was refused).

## Relationships
- **`src/kernel/authentication.ts`** — Source of `resolveCredential` and the `ResolvedCredential` type used by `credentialOf`.
- **`src/modules/api-keys/services/api-keys.ts`** — Source of `mint`, the function `credentialHolding` invokes to produce the secret.
- **`src/kernel/access/tenant.ts`** — Provides `DEPLOYMENT_TENANT_ID`, used as the caller's tenant in the mint context.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser`, used to create the admin minter.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — Source of the `TenantCallerContext` type shaping the mint call.
- **`src/domain-primitives/time.ts`** — Provides `DAY_MS` for the 7-day expiry calculation.
- **Downstream test consumers** (e.g. `api-keys.test.ts`, `revoked-by-account.test.ts`, `api-key-authentication.test.ts`, `account-protection.test.ts`, product/user contract tests) import these two helpers to obtain a real bearer secret or to assert on the resolved credential after a request.

## Notes
- The mint context hardcodes `DEPLOYMENT_TENANT_ID`, **not** `TEST_TENANT_ID`. `createUser` writes membership under the deployment tenant, and `resolveCredential` re-reads live membership rather than trusting the snapshot. Using the wrong constant mints successfully but resolves to zero permissions (403), which can be mistaken for a guard bug.
- The minter must have an authenticator app armed (`armAuthenticator`) before calling `mint`; the staff role is insufficient without it.
- `credentialHolding` creates a **fresh** user per call. Tests that need a shared minter across multiple keys should cache the result.
- `credentialOf` returns `undefined` (not an error) when the secret is refused, so callers must null-check before asserting on `caller.permissions`.
