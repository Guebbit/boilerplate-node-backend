---
source: tests/support/credentials.ts
sha256: 63208923a8bf8a7e16afcff0c39a893703319f04f8d7d0306f20befd3088beb8
generated_at: 2026-10-29T07:07:12.422006+00:00
model: ollama:qwen3.8:27b
---

# tests/support/credentials.ts

## Purpose

Provides two small helpers for integration and contract tests that need to drive the real API-key authentication chain: minting a genuine `sk_…` secret through the production `mint` service, and resolving a secret back through `resolveCredential`. Exists so tests can assert on caller context and guard behavior without hand-crafting secrets the resolver won't recognise.

## Key elements

- **`credentialHolding(permissions: string[]): Promise<string>`** — Creates a verified admin user via the users factory, arms their authenticator, builds a `TenantCallerContext` scoped to `DEPLOYMENT_TENANT_ID`, calls the real `mint` with a 7-day expiry, and returns the plaintext secret (suitable for an `Authorization: Bearer` header). Throws if `mint` reports failure.
- **`credentialOf(secret: string): Promise<ResolvedCredential | undefined>`** — Thin wrapper around `resolveCredential` that unwraps the `{ ok }` discriminated union: returns `resolution.ok` on success, `undefined` if the credential was refused.

## Relationships

- **`@kernel/access/tenant`** — imports `DEPLOYMENT_TENANT_ID` to set the minter's `tenantId` in the caller context.
- **`@kernel/authentication`** — imports `resolveCredential` (used by `credentialOf`) and the `ResolvedCredential` type.
- **`@modules/api-keys/services/api-keys`** — imports `mint`; credentials are created through the production minter, not a fixture.
- **`@modules/users/tests/factories`** — imports `createUser` to produce the admin minter.
- **`@types` (→ `src/types/auth-context.ts`)** — imports the `TenantCallerContext` type used to build the mint call context.
- **`./authenticator`** — imports `armAuthenticator` to satisfy the TOTP requirement for staff-role mints.
- **Consumer tests** (`api-keys.test.ts`, `revoked-by-account.test.ts`, `sessions-revoked-outbox.test.ts`, `api-key-authentication.test.ts`, `account-protection.test.ts`, `api-key-reads.test.ts`, `api.contract.test.ts` ×2, `abilities.test.ts`) — import these helpers to obtain a real secret for the `Bearer` header or to inspect the resolved caller.

## Notes

- **`DEPLOYMENT_TENANT_ID` vs `TEST_TENANT_ID`:** The context must use `DEPLOYMENT_TENANT_ID` because `createUser` writes the minter's membership under that ID and `resolveCredential` re-reads membership at resolve time. Using the wrong ID mints successfully but resolves to zero permissions, surfacing as a 403 that looks like a guard bug.
- The minter must be an **admin** with an **armed authenticator app**; `mint` rejects a superset of permissions, so the `permissions` array passed in is exactly what the credential will hold.
- `credentialOf` intentionally collapses the failure case to `undefined` rather than exposing the `{ ok: false }` wrapper, so callers can `if (!cred)` without pattern-matching the union.
