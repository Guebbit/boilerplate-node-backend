---
source: src/modules/account/services/export.ts
sha256: 34916e14e29cd2e24bd0326f7ebbeb23a0229f02b279ac9b81af6ecbd88cbb40
generated_at: 2026-11-08T04:18:06.333326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export.ts

## Purpose

Implements the account data-export flow (GDPR Art. 15 / 20) as a background job rather than a synchronous request. A POST records a `building` row and queues a build; a worker writes the JSON file; a link is mailed on completion. A GET reports status or streams the finished file. The module owns the row lifecycle (create, read, replace, erase) and enforces the one-live-export-per-account invariant.

## Key elements

- **`requestExport(userId, context)`** — entry point for `POST /account/export`. Resolves the account, checks the mail budget, inserts (or reuses) a `building` row, dispatches the job to the queue (or runs it inline if no broker is available), records an audit event, and returns a `202` with the export's status.
- **`readOwnExport(userId)`** — entry point for `GET /account/export` (status view). Returns the row's status, treating a stale `building` row as `failed`. Returns `undefined` if no row exists or it is past retention.
- **`openOwnExport(userId, context)`** — streams a `ready` export file for download, records a "downloaded" audit event, and returns the UTC date string used to name the download. Returns `undefined` for any non-downloadable state.
- **`eraseExports(userId, session)`** — implements the `personalData.erase` hook: deletes the DB row inside the erasure transaction and returns a post-commit step that removes the file from the export store.
- **`settleInlineExports()`** — test helper; waits (up to 30 s) for inline builds tracked in the `inlineBuilds` Set to finish.
- **`insertRow`** / **`dispatch`** / **`rowOrRefusal`** / **`isStale`** — internal helpers managing the row upsert, queue dispatch with inline fallback, budget-check-then-replace logic, and 30-minute staleness detection.

## Relationships

- **`src/modules/account/controllers/post-account-export.ts`** / **`get-account-export.ts`** — thin HTTP controllers that call `requestExport` and `readOwnExport` / `openOwnExport` respectively.
- **`src/modules/account/mail-budget.ts`** — `mailRecipientRefusal` is consulted *before* replacing an existing export; a refusal leaves the old file intact.
- **`src/modules/account/emails.ts`** — provides `recipientLocale` for the job payload so the worker composes the notification in the caller's language.
- **`src/modules/account/audit.ts`** — supplies `accountAuditActions` enum values (`AUTH_DATA_EXPORT_REQUESTED`, `AUTH_DATA_EXPORT_DOWNLOADED`).
- **`src/modules/account/config.ts`** — `exportRetentionMs` determines the row's `expiresAt`.
- **`src/infrastructure/adapters/queue.ts`** — `publishToQueue` hands the job to the broker; if it returns `false` the build runs inline via `runExportJob`.
- **`src/infrastructure/adapters/export-store.ts`** — `openExport` / `removeExport` handle the actual file on disk.
- **`src/infrastructure/adapters/logger.ts`** — logs inline build failures.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` and the `ResponseSuccess` / `ResponseReject` union shape the return values.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the two audit events.
- **`src/infrastructure/persistence/mongo-errors.ts`** — `isDuplicateKey` resolves the race when two concurrent requests both try to insert.
- **`src/infrastructure/runtime/settle.ts`** — `settleWithin` underpins the test-only `settleInlineExports` waiter.
- **`src/domain-primitives/time.ts`** — exports `MINUTE_MS`, used to compute the 30-minute `EXPORT_BUILD_LIMIT_MS`.
- **`src/kernel/registry.ts`** — defines the `AfterErase` return type for `eraseExports` and the `PersonalDataSection` mechanism that lets the worker collect each module's data without this file importing every sibling.

## Notes

- **One live export per account.** A non-stale `building` row is returned as-is (no new job). `ready` or `failed` rows are replaced: old file deleted, new row inserted.
- **Budget before delete.** `rowOrRefusal` checks the mail budget *before* removing the existing export, so a 429 leaves the previous file downloadable.
- **Inline builds outlive the response.** When no broker picks up the job, `runExportJob` is fire-and-forget. A late finish finds its row already gone and deletes its own file. The `inlineBuilds` Set exists solely so tests (and shutdown) can await completion.
- **File deletion is not transactional.** `eraseExports` deletes the row inside the Mongoose session but defers `removeExport` to the post-commit step, because the file store cannot participate in the DB transaction.
- **Staleness is time-based, not state-based.** A `building` row older than 30 minutes is *read* as `failed` by both `readOwnExport` and `rowOrRefusal`, but the row's stored status is never rewritten.
