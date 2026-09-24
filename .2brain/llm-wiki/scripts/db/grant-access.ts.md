---
source: scripts/db/grant-access.ts
sha256: 633708f9cd2c53781934313a6a1377ef784ad5fa397401502a9c2e7ef875c244
generated_at: 2026-09-23T17:23:50.125269+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/grant-access.ts

## Purpose

CLI entry point for granting a role to an already-existing account (`npm run access:grant -- <email> <role> [--scope platform]`). It exists as the manual, operator-run step that creates the first owner on a fresh deployment—deliberately not automated in signup to avoid a race-condition vulnerability. All business logic is delegated to `access-grant.ts`; this file only parses arguments and manages the database connection lifecycle.

## Key elements

- **`main()`** — Validates the two positional args (email, role) and the `--scope` flag (must be `"tenant"` or `"platform"`, defaults to `"tenant"`), then calls `start()` → `grantAccess()` → logs success.
- **`parseArgs(...)`** — Uses Node's built-in `node:util` parser; exposes two positionals and a `--scope` string option.
- **Module-level invocation** — `void runScript(main, stopDatabase)` wires up the connect/disconnect lifecycle and fires the script immediately.

## Relationships

- **`scripts/db/access-grant.ts`** — Provides `grantAccess(email, roleName, scope)`, the connection-free core logic this file delegates to.
- **`scripts/db/run-script.ts`** — Provides `runScript(fn, teardown)`, which wraps execution with process-level error handling and the `stopDatabase` teardown callback.
- **`src/infrastructure/runtime/database.ts`** — Supplies `start()` (open connection before the grant) and `stopDatabase` (passed to `runScript` for cleanup).
- **`src/infrastructure/adapters/logger.ts`** — Supplies `logger.info(...)` for the success message.
- **`src/types/index.ts` / `src/types/auth-context.ts`** — Source of the `AuthorizationScope` type (`"tenant" | "platform"`) imported via the `@types` barrel.

## Notes

- The `--scope` value is typed as `string` by `parseArgs`; the code manually narrows it to `AuthorizationScope` after a runtime check. Do not rely on the parser's `type: 'string'` for exhaustiveness.
- This file is a thin shell on purpose—tests target `access-grant.ts` directly, not this CLI wrapper.
- Requires a running database (reached via `dotenv/config` + `start()`); not intended for unit-test execution without mocking the runtime.
