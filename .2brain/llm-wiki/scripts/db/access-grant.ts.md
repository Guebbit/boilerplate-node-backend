---
source: scripts/db/access-grant.ts
sha256: 493de5e922ff40310673f257caa23fe5ba8f9fa629d28d4a7a077a27c7479542
generated_at: 2026-09-23T17:23:20.884192+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/access-grant.ts

## Purpose

Connection-free logic for granting a role to an existing account. It is extracted from the CLI entry point `grant-access.ts` so that tests can drive the grant flow per case without a live database connection or `process.argv` parsing on import (same split pattern as `index-sync.ts` / `sync-indexes.ts`).

## Key elements

- **`GrantAccessError`** — lightweight error subclass; the CLI wrapper in `grant-access.ts` catches it to produce a clean, non-zero exit.
- **`grantAccess(email, roleName, scope)`** — the single exported function. Resolves a user by email via `userService.findByEmail`, then delegates to `assignRole`. Passes `null` as the tenant when `scope` is `'platform'`, otherwise `DEPLOYMENT_TENANT_ID`. Rejects (throws `GrantAccessError`) if no account matches the email rather than creating one. Does not accept a `granter` argument — `assignRole`'s contract reserves the no-granter path for console operators.

## Relationships

- **`scripts/db/grant-access.ts`** — the CLI wrapper that imports `grantAccess` and `GrantAccessError`, opens a DB connection, and parses `process.argv` before calling into this module.
- **`src/modules/access/index.ts`** → **`src/modules/access/service.ts`** — provides `assignRole`, the actual role-assignment operation. This file is one of the three callers `assignRole`'s docblock names (console operator).
- **`src/modules/users/index.ts`** → **`src/modules/users/service.ts`** — provides `userService.findByEmail` for the account lookup.
- **`src/kernel/access/tenant.ts`** — exports `DEPLOYMENT_TENANT_ID`, used as the tenant when the scope is deployment-level.
- **`src/types/auth-context.ts`** (re-exported via **`src/types/index.ts`**) — source of the `AuthorizationScope` type parameter.
- **`tests/integration/scripts/db/access-grant.test.ts`** — integration tests that exercise `grantAccess` directly, relying on the fact that this file does not open its own connection.

## Notes

- This file intentionally has **no** `granter` parameter. Passing one would violate `assignRole`'s caller contract; the "console operator" path is the only one that omits it.
- The function is strict about the pre-existing-account requirement: it never calls a user-creation path. If the email is unknown, the only outcome is `GrantAccessError`.
- `scope` is a simple discriminating value (`'platform'` vs. deployment); it is not a full object. The ternary on `'platform'` is the only branching logic in the file.
