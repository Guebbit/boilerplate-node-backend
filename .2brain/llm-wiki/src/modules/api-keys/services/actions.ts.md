---
source: src/modules/api-keys/services/actions.ts
source_sha256: 2dd8d72b8c1671ac439606390e536e45254673ee8ab44d6fa34b26a1f4ae866a
context_sha256: 24baf8f401a09f20b26919789f8fe7e4abd3cb4ec711457d40d168a4208ea5f8
generated_at: 2026-11-22T04:22:59.933834+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/services/actions.ts

## Purpose
Decides, in one place, what a caller may do to an API key record so clients don't re-derive it. Currently the only action is `revoke`, computed from the caller's `delete:ApiKey` permission and the credential's own state.

## Key elements
- `actionsForRows(context: TenantCallerContext)` — takes the caller context and returns a function `(row: Pick<StoredApiKey, 'revokedAt'>) => ApiKeyActions`.
  - The ability is built once via `permitsOnRows(context.caller, 'ApiKey', ['delete'])`, then reused per row, so a page of rows costs one ability rather than one per row.
  - Returned `revoke` is `permits({}).delete && !row.revokedAt`.

## Relationships
- `src/kernel/ability.ts` — supplies `permitsOnRows`, used to build the per-caller permission check.
- `src/modules/api-keys/repository.ts` — supplies the `StoredApiKey` type; only its `revokedAt` field is needed.
- `src/types/index.ts` (and `src/types/auth-context.ts`) — provide `ApiKeyActions` and `TenantCallerContext`, imported via the `@types` alias.
- `src/modules/api-keys/services/api-keys.ts` — sibling service in the same module.
- `src/modules/api-keys/tests/unit/actions.test.ts` — unit tests for this file.

## Notes
- A revoked key gets `revoke: false` rather than an offered no-op, since revoking is permanent and a repeat call would be accepted but do nothing.
- The permission check is made with an empty row (`permits({})`), so the result depends on the caller's ability only, not on per-row attributes.
- The module header says to delete this file if the module has no per-row controls a client must grey out.
