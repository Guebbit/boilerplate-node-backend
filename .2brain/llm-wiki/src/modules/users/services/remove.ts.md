---
source: src/modules/users/services/remove.ts
sha256: 229c7006a4be76b5e884370a8e138a9883d0f785a4f17047d6d0bbc01be99be2
generated_at: 2026-10-15T12:11:43.233115+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/remove.ts

## Purpose

Service layer for user removal and restoration. Handles soft delete (stamp `deletedAt`), hard delete (erasure cascade + document deletion + image cleanup), and restore (undo soft delete). Exists as the single choke-point where an account's lifecycle transitions to "gone" or "back," ensuring audit, access-control, and data-erasure concerns are co-located.

## Key elements

- **`runErasureCascade`** (private) – Iterates every hook registered in `personalDataErasers()` sequentially within a `ClientSession` transaction, then calls `userRepository.deleteOne`. Returns the list of `AfterErase` callbacks each eraser deferred.
- **`runAfterErase`** (private) – Executes deferred callbacks after commit. Each callback is individually `.catch`-ed and logged; the function itself never rejects.
- **`remove`** (exported) – Core entry point. If `hardDelete`, wraps the cascade in `withTransaction`, runs post-erase work, deletes the avatar via `imageStore`, records audit, and returns 200. Otherwise stamps `deletedAt`, calls `markSessionsEnded`, optionally tags `deletedBy: 'reaper'`, saves, records audit, and returns 200. Idempotent: an already-soft-deleted user short-circuits to success.
- **`restoreById`** (exported) – Looks up the user by ID, runs `outrankedRefusal`, rejects 409 if not soft-deleted, clears `deletedAt`/`deletedBy`, saves, records audit, returns the restored document.
- **`removeById`** (exported) – Convenience wrapper: fetches the document, applies `outrankedRefusal`, then delegates to `remove`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/runtime/database.ts` | `withTransaction` provides the `ClientSession` that the hard-delete cascade runs inside. |
| `src/modules/users/erasure-registry.ts` | `personalDataErasers()` supplies the ordered list of erase hooks executed by `runErasureCascade`. |
| `src/kernel/registry.ts` | Source of the `AfterErase` type returned by eraser hooks. |
| `src/modules/users/repository.ts` | `userRepository.save` / `deleteOne` / `findById` perform the actual Mongo operations. |
| `src/modules/users/model.ts` | `UserDocument` type used throughout. |
| `src/modules/users/services/credentials.ts` | `markSessionsEnded` bumps the session epoch in the same save as a soft delete so old tokens die. |
| `src/modules/users/audit.ts` | `usersAuditActions` provides the enum values passed to `recordAudit`. |
| `src/infrastructure/observability/audit.ts` | `recordAudit` writes the audit trail after every successful operation. |
| `src/modules/access/index.ts` | `outrankedRefusal` guards `restoreById` and `removeById` against a caller ranking at or below the target. |
| `src/infrastructure/adapters/image-store.ts` | `imageStore.remove(user.imageUrl)` deletes the avatar file after a hard-delete commit. |
| `src/infrastructure/i18n/index.ts` | `t()` localises the human-readable strings in every response body. |
| `src/infrastructure/http/response.ts` | `generateSuccess` / `generateReject` shape the HTTP response envelope. |
| `src/infrastructure/adapters/logger.ts` | `logger.error` logs each individually-failed post-erase step. |

## Notes

- **Sequential, not parallel, erasure cascade.** `ClientSession` allows only one in-flight operation; using `Promise.all` would produce a misleading "sharded cluster" error. The `for…of` loop is intentional.
- **`runAfterErase` is fire-and-forget by design.** The account document is already committed-deleted, so a failure in a deferred step cannot roll anything back; the log line is the only signal.
- **Soft-delete idempotency.** A second `remove` call on an already-soft-deleted user returns 200 immediately without re-saving, making `DELETE` safe to retry.
- **`deletedBy` is set only for the system reaper.** Admin soft-deletes leave `deletedBy` unset; only `context.caller.system` soft-deletes stamp `'reaper'`, and only that path may later be hard-deleted by the reaper.
- **Sessions are not restored.** `restoreById` clears `deletedAt` but does *not* undo `markSessionsEnded`; the owner must log in again.
- Stryker mutation-testing disable/restore annotations wrap the `logger.error` call in `runAfterErase` to suppress noise from an intentionally-unreachable failure path.
