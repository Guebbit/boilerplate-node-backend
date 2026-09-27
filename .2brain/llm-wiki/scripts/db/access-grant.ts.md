---
source: scripts/db/access-grant.ts
sha256: 3ecb87a34d4e149cdde2027cf7ab0c5f9b239eb2aa7623cd57b9ea7dc6bc8364
generated_at: 2026-09-27T13:53:39.749369+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/access-grant.ts

## Purpose

The connection-free core logic for granting a role to an **existing** account by email. It is split out of `grant-access.ts` (the CLI wrapper) so that integration tests can import and drive it per-case without the wrapper's side-effects (opening a DB connection, parsing `process.argv`) firing on import.

## Key elements

- **`GrantAccessError`** (exported class) — thrown for any caller misuse (unknown email, undeclared role). The CLI wrapper catches it and produces a clean exit message.
- **`grantAccess(email, roleName, scope)`** (exported function) — looks up the account via `userService.findByEmail`, throws `GrantAccessError` if none exists, then calls `assignRole` with the resolved tenant id. Returns `Promise<void>`.

## Relationships

- **`scripts/db/grant-access.ts`** — the CLI wrapper that imports `grantAccess` and `GrantAccessError`, opens a connection, parses argv, and translates the error into a process exit.
- **`src/modules/access/index.ts`** → **`src/modules/access/service.ts`** — provides `assignRole`, the actual role-mutation primitive.
- **`src/modules/users/index.ts`** → **`src/modules/users/service.ts`** — provides `userService.findByEmail` for the account lookup.
- **`src/kernel/access/tenant.ts`** — supplies `DEPLOYMENT_TENANT_ID`, used when scope is not `'platform'`.
- **`src/types/index.ts`** → **`src/types/auth-context.ts`** — source of the `AuthorizationScope` type used in the signature.
- **`tests/integration/scripts/db/access-grant.test.ts`** — integration tests that import `grantAccess` directly, bypassing the CLI wrapper.

## Notes

- No `granter` argument is passed to `assignRole`. The docblock on `assignRole` names "an operator on the console" as the caller permitted to grant without escalating from an existing role; this file is that caller.
- Tenant resolution is binary: `'platform'` scope → `null`; everything else → `DEPLOYMENT_TENANT_ID`.
- The function **refuses to create accounts**. If the email is unknown, the caller must sign up first.
- The split pattern mirrors `index-sync.ts` / `sync-indexes.ts`: pure logic in one file, connection + argv handling in its CLI twin.
