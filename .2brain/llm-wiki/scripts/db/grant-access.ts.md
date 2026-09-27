---
source: scripts/db/grant-access.ts
sha256: d2ec6096a27bd0a3f8f9eda1402612321d5b4c7d70b80f5fdada65bf507abe23
generated_at: 2026-09-27T13:54:08.403732+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/grant-access.ts

## Purpose

CLI entry point for granting a role to an existing account (e.g., promoting the first signup to `owner`). It exists as a thin shell around the pure logic in `access-grant.ts`, handling only argument parsing, database connection lifecycle, and the log message. The separation allows the grant logic to be unit-tested without a live connection.

## Key elements

- **`parseArgs` invocation (module-level)** — Parses two positionals (`email`, `roleName`) and one optional flag `--scope` (defaults to `'tenant'`, accepts `'platform'`).
- **`main()`** — Validates argv (both positionals present; scope is a legal value), then chains `start()` → `grantAccess(email, roleName, scope)` → `logger.info(...)`.
- **`runScript(undefined, main, stopDatabase)`** — Top-level call; passes `undefined` for the cron-schedule slot, making this a one-off admin script rather than a scheduled job. `stopDatabase` is the teardown callback.

## Relationships

- **`scripts/db/access-grant.ts`** — Provides `grantAccess()`, the connection-free grant logic. This file is its only production caller.
- **`scripts/run-script.ts`** — Provides `runScript()`, which wraps `main` with error handling and the `stopDatabase` teardown.
- **`src/infrastructure/runtime/database.ts`** — Provides `start()` / `stopDatabase()` for the connect/disconnect lifecycle.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger` used to emit the success message.
- **`src/types/auth-context.ts`** — Source of the `AuthorizationScope` type (`'tenant' | 'platform'`) used to narrow `rawScope`.
- **`src/types/index.ts`** — Re-exports `AuthorizationScope` (imported via `@types`).

## Notes

- The first argument to `runScript` is intentionally `undefined`. The `run-script.ts` docstring documents that `undefined` signals "hand-run admin utility" (no cron interval). Don't confuse this with a missing argument.
- `parseArgs` types `values.scope` as `string | undefined`, so an explicit `const scope: AuthorizationScope = rawScope` cast is required after the runtime check. This is flagged in a comment; don't remove the guard.
- The script assumes the account already exists (created via signup). It does **not** create accounts.
- Intended to be run once per deployment to break the "first signup becomes owner" race; after that it is an infrequent ops tool.
