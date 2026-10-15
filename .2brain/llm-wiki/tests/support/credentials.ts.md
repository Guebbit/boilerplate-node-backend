---
source: tests/support/credentials.ts
sha256: 756ffaf704fe10882cd65d26fd40519ca5ab250e55f9538c74b9a035f2209160
generated_at: 2026-10-15T12:57:29.067568+00:00
model: ollama:qwen3.8:27b
---

# tests/support/credentials.ts

## Purpose

Test-support helper that mints a **real** API-key credential through the production `mint` service (not a fixture) and resolves secrets back through the production `resolveCredential`. It exists so integration and cross-cutting tests can drive the full mounted chain—mint → store → resolve—with a secret the runtime will actually recognise.

## Key elements

- **`credentialHolding(permissions: string[]): Promise<string>`** — Creates a verified admin user via `createUser`, builds a `TenantCallerContext` scoped to `DEPLOYMENT_TENANT_ID`, calls `mint` with the exact permission set, and returns the plaintext `sk_...` secret for use in an `Authorization: Bearer` header. Throws if `mint` fails.
- **`credentialOf(secret: string): Promise<ResolvedCredential | undefined>`** — Wraps `resolveCredential` and unwraps the discriminated result: returns the resolved value on success, `undefined` on refusal. Lets tests assert directly on the caller without dealing with the `{ ok }` envelope.

## Relationships

- **`src/kernel/authentication.ts`** — Source of `resolveCredential` and the `ResolvedCredential` type; `credentialOf` is a thin unwrapping wrapper around it.
- **`src/kernel/access/tenant.ts`** — Provides `DEPLOYMENT_TENANT_ID`, the tenant the minter is enrolled under and the one `resolveCredential` re-reads at resolution time.
- **`src/modules/api-keys/services/api-keys.ts`** — Source of `mint`; `credentialHolding` delegates the actual key-creation to this service.
- **`src/modules/users/tests/factories.ts`** — Source of `createUser`, used to materialise the admin minter user.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — Provide the `TenantCallerContext` type used to shape the caller object passed to `mint`.
- **Consumer tests** (`api-keys` integration tests, `api-key-reads.test.ts`, `cross-cutting/api-key-authentication.test.ts`, `cross-cutting/role-hierarchy.test.ts`, `integration/security-events.test.ts`) — Call `credentialHolding` to obtain a valid bearer secret and `credentialOf` to assert what the runtime resolves for that secret.

## Notes

- **Tenant-ID mismatch is a silent 403.** The caller context must use `DEPLOYMENT_TENANT_ID` (not a `TEST_TENANT_ID` alias). `createUser` writes the minter's membership under the deployment tenant, and `resolveCredential` re-reads live membership rather than trusting the mint-time snapshot. A mismatch mints successfully but resolves to zero permissions, surfacing as a 403 that looks like a guard bug.
- **Exact-permission matching.** `mint` refuses a credential whose permissions are a superset of the caller's. Pass only the keys you intend the credential to hold.
- **`credentialOf` never throws on refusal.** It returns `undefined` instead, so tests must check for `undefined` (or use `expect(...).toBeUndefined()`) rather than catching an error.
