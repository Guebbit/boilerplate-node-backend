---
source: src/modules/account/services/export.ts
sha256: cb5e8de2b00a74741a8a895518683daca44d28759620d0ddf524a1c8cab5ca91
generated_at: 2026-10-29T02:40:59.651509+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export.ts

## Purpose

Implements the account data-export lifecycle (GDPR Art. 15 & 20): a caller requests their data, a row is recorded and a build job is queued, a worker writes the file, and a download link is mailed. Encapsulates the "one live export per account" invariant — a `building` export is returned as-is, while a `ready` or `failed` one is replaced by a new request.

## Key elements

- **`requestExport(userId, context)`** — Entry point for `POST /account/export`. Resolves or creates the account's row, checks the mail budget for a new build, dispatches the job (broker or inline), and returns `202` with the export status.
- **`readOwnExport(userId)`** — Entry point for `GET /account/export`. Returns the caller's current export status, or `undefined` if none exists / expired. A `building` row past the 30-min stale threshold is reported as `failed`.
- **`openOwnExport(userId, context)`** — Opens a `ready` and unexpired export file for streaming download; records an audit event on download.
- **`eraseExports(userId, session)`** — Implements the module's `AfterErase` hook: deletes the row inside the erasure transaction and returns a post-commit step that removes the physical file.
- **`settleInlineExports()`** — Test/shutdown helper that waits (up to 30 s) for inline builds still running in the process.
- **`insertRow`** (internal) — Inserts a `building` row; on a duplicate-key error, fetches the winning row instead of throwing.
- **`dispatch`** (internal) — Publishes the job to the `ACCOUNT_EXPORT` queue; if no broker is available, runs `runExportJob` inline and tracks the promise in `inlineBuilds`.
- **`rowOrRefusal`** (internal) — Core decision: reuse a fresh `building` row, or (after a mail-budget check) delete the old export and insert a new one.

## Relationships

- **`@infrastructure/adapters/export-store`** — `openExport` / `removeExport` handle the actual file I/O on the export store.
- **`@infrastructure/adapters/queue`** — `publishToQueue` publishes the build job; a `false` return triggers the inline fallback.
- **`@infrastructure/http/response`** — `generateSuccess` and the `ResponseSuccess` / `ResponseReject` types shape every HTTP reply.
- **`@infrastructure/observability/audit`** — `recordAudit` emits events for export-requested and export-downloaded.
- **`@infrastructure/persistence/mongo-errors`** — `isDuplicateKey` lets `insertRow` detect and recover from a race on the unique `(userId)` index.
- **`@infrastructure/runtime/settle`** — `settleWithin` bounds the wait on inline build promises for tests and graceful shutdown.
- **`src/kernel/registry.ts`** — Provides the `AfterErase` type that `eraseExports` implements as part of the cross-module erasure protocol.
- **`src/modules/account/config.ts`** — `exportRetentionMs` sets the `expiresAt` value at row-creation time.
- **`src/modules/account/emails.ts`** — `recipientLocale` resolves the locale for the mailed link.
- **`src/modules/account/mail-budget.ts`** — `mailRecipientRefusal` is consulted before any new build is committed, so a refused request leaves the existing export intact.
- **`src/modules/account/audit.ts`** — `accountAuditActions` supplies the action strings used in audit records.
- **Controllers** (`get-account-export.ts`, `post-account-export.ts`) — Thin HTTP handlers that delegate to `readOwnExport`/`openOwnExport` and `requestExport` respectively.
- **`src/modules/account/module.ts`** — Wires the routes and registers `eraseExports` as the module's erasure hook.

## Notes

- **Stale threshold is 30 minutes.** A `building` row older than that is *reported* as `failed` (in both `readOwnExport` and `rowOrRefusal`) but the in-flight build is not killed; a late worker simply finds its row gone and deletes its own file.
- **Inline builds are fire-and-forget from the request's perspective.** The caller already received `202`; the promise is tracked in a module-level `Set` only so that `settleInlineExports` (tests) and process shutdown can wait.
- **File deletion on erase is post-commit.** The row is removed inside the Mongoose transaction, but the physical file is deleted in the returned `AfterErase` callback, which runs only after the transaction commits. A crash between commit and file-delete leaves an orphan file (swept by the nightly reaper).
- **Budget is checked *before* deleting the old export.** If `mailRecipientRefusal` returns a 429, the existing `ready` export remains downloadable.
- **No secret/credential access.** The export reads only profile data via each owning module's `collect` (see `kernel/registry.ts` `PersonalDataSection`); `userService.getById` is called without a credentials scope.
