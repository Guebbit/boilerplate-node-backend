---
source: src/modules/account/services/export.ts
sha256: 854f5e7741b615e93cb0b4801b86847214c5804fc3d647693b931d006c3cf273
generated_at: 2026-10-14T08:48:27.789506+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export.ts

## Purpose

Implements the account data-export lifecycle (GDPR Art. 15/20) as an asynchronous job: a `POST` request records a `building` row and enqueues (or runs inline) a background build; a `GET` returns the finished file for download. Enforces the one-export-per-account rule, a 30-minute build staleness ceiling, and mailbox-budget accounting before a new build replaces an old one.

## Key elements

- **`EXPORT_BUILD_LIMIT_MS`** (30 min) — a `building` row older than this is treated as `failed`, freeing the account's single slot.
- **`AccountExportRequestResult`** — the `202` body: `{ id, status }`.
- **`inlineBuilds`** (module-private `Set<Promise>`) — tracks builds running in-process because no broker accepted the job.
- **`settleInlineExports(timeoutMs)`** — awaits all inline builds; used at graceful shutdown and in tests.
- **`requestExport(userId, email, context)`** — the `POST /account/export` handler: validates the user, reuses a non-stale `building` row, charges the mail budget, inserts a new row (deduping via unique index), dispatches the job, records audit, and returns `202`.
- **`openOwnExport(userId, exportId, context)`** — the `GET /account/export/{id}` handler: fetches the row scoped to the owner, checks `ready` + not expired, streams the file from the export store, records the download audit event.
- **`eraseExports(userId, session)`** — the module's `AfterErase` hook: deletes the row inside the erasure transaction; returns a post-commit callback that removes the file (files can't roll back).
- **`dispatch(job)`** (private) — publishes to the broker queue; if the broker is unavailable, runs `runExportJob` inline and tracks the promise in `inlineBuilds`.
- **`rowOrRefusal`** (private) — resolves the existing-or-new row, enforcing the one-export rule and the mailbox budget *before* deleting the old row.
- **`insertRow`** (private) — inserts a `building` row; on duplicate-key error (race), returns the winner's row.

## Relationships

- **`@infrastructure/adapters/export-store.ts`** — `openExport` streams the finished JSON file; `removeExport` deletes it on replacement or erasure.
- **`@infrastructure/adapters/queue.ts`** — `publishToQueue` hands the `ACCOUNT_EXPORT` job to the broker; the return value (`published`) decides whether to fall back to an inline run.
- **`@infrastructure/adapters/logger.ts`** — logs inline-build failures.
- **`@infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` build the HTTP response envelopes.
- **`@infrastructure/i18n/index.ts`** — `t()` localizes user-facing messages (`account.export.requested`, `users.not-found`).
- **`@infrastructure/observability/audit.ts`** — `recordAudit` emits the `AUTH_DATA_EXPORT_REQUESTED` and `AUTH_DATA_EXPORT_DOWNLOADED` events.
- **`@infrastructure/persistence/mongo-errors.ts`** — `isDuplicateKey` distinguishes the expected race-condition error in `insertRow`.
- **`@infrastructure/runtime/settle.ts`** — `settleWithin` is the primitive behind `settleInlineExports`.
- **`src/kernel/registry.ts`** — provides the `AfterErase` type for `eraseExports` and the `PersonalDataSection` contract that lets this module collect data via owning modules' `collect` methods rather than importing sibling repositories.
- **`src/modules/account/config.ts`** — `exportRetentionMs()` supplies the TTL stamped onto each row's `expiresAt`.
- **`src/modules/account/audit.ts`** — `accountAuditActions` constants used in audit records.
- **`src/modules/account/emails.ts`** — `recipientLocale` resolves the locale for the mail notification.
- **`src/modules/account/controllers/post-account-export.ts`** — HTTP controller that calls `requestExport`.
- **`src/modules/account/controllers/get-account-export.ts`** — HTTP controller that calls `openOwnExport`.

## Notes

- **Inline builds outlive the response.** When the broker is down, `dispatch` fires `runExportJob` without awaiting it. The promise is tracked in `inlineBuilds` so shutdown and tests can wait, but the HTTP reply is already sent. A late-finishing build will find its row deleted (past the staleness window) and cleans up its own file.
- **Mail budget is checked before deletion.** If the budget refuses a new build, the previously `ready` export remains downloadable — the caller is not penalized.
- **The staleness limit does not kill the build.** It only changes what `rowOrRefusal` reports to the next requester. The actual build promise runs to completion regardless.
- **`eraseExports` is two-phase.** The row deletion joins the caller's transaction (rollable); the file deletion runs in the returned `AfterErase` callback, which executes only after commit because file deletion is irreversible.
- **One slot, one winner.** The unique index on `userId` is the sole concurrency guard; no application-level lock is taken. The losing racer reads back the winner's row.
