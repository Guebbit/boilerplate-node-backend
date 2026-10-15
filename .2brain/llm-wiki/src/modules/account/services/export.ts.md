---
source: src/modules/account/services/export.ts
sha256: c6b9ac3bcf34b9355819da501bc1ee9022684499b2027abefd856ebeafee8217
generated_at: 2026-10-15T10:00:11.959025+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export.ts

## Purpose

Implements the GDPR "give me my data" flow (Art. 15/20) as an asynchronous job rather than a synchronous request. A `POST` records a `building` row and queues a build; a worker writes the JSON file; the caller downloads it later via `GET`. Enforces a single live export per account with replace-on-rebuild semantics, and participates in account erasure.

## Key elements

- **`EXPORT_BUILD_LIMIT_MS`** (30 min) — ceiling after which a `building` row is treated as failed; prevents a dead inline build from permanently blocking the account's single slot.
- **`AccountExportRequestResult`** — `{ id, status }` shape returned by both the POST response and internal resolution.
- **`settleInlineExports(timeoutMs?)`** — awaits builds running in-process (no broker); used at graceful shutdown and by tests.
- **`insertRow(userId)`** — inserts a fresh `building` row; on duplicate-key race, returns the winner's row instead of erroring.
- **`dispatch(job)`** — publishes the export job to the broker; if no broker is available, runs `runExportJob` inline (fire-and-forget, tracked in `inlineBuilds`).
- **`rowOrRefusal(userId, email)`** — central decision: returns the existing `building` row (uncharged), or charges the mail budget, deletes any old `ready`/`failed` row, and inserts a new one. A budget refusal short-circuits before deletion.
- **`requestExport(userId, context)`** — public POST handler. Resolves the row, records an audit event, builds the `AccountExportJobPayload`, dispatches (if new), and returns `202`.
- **`openOwnExport(userId, exportId, context)`** — public GET handler. Ownership is the query; only `ready` rows within retention are opened as a stream. Records a download audit event.
- **`eraseExports(userId, session)`** — `AfterErase` hook. Deletes the row inside the erasure transaction; deletes the file in the returned post-commit step (files cannot roll back).

## Relationships

- **`@infrastructure/adapters/export-store.ts`** — `openExport` streams the finished file; `removeExport` deletes it on replace and on erasure.
- **`@infrastructure/adapters/queue.ts`** — `publishToQueue` delivers the job to `WORKER_CHANNELS.ACCOUNT_EXPORT`; a `false` return triggers inline execution.
- **`@infrastructure/adapters/logger.ts`** — logs the error when an inline build rejects.
- **`@infrastructure/http/response.ts`** — `generateSuccess` builds the 202 body; `ResponseSuccess`/`ResponseReject` are the return-type union.
- **`@infrastructure/i18n/index.ts` / `context.ts`** — `t()` for the success message; `CallerContext` carries the request locale.
- **`@infrastructure/observability/audit.ts`** — `recordAudit` fires on request and on download.
- **`@infrastructure/persistence/mongo-errors.ts`** — `isDuplicateKey` distinguishes the insert race from real failures.
- **`@infrastructure/runtime/settle.ts`** — `settleWithin` bounds the `settleInlineExports` wait.
- **`@kernel/registry.ts`** — supplies the `AfterErase` type; the doc comment also points to `PersonalDataSection` and `./personal-data-registry.ts` for how cross-module data sections reach the job without this file importing every sibling.
- **`@modules/account/config.ts`** — `exportRetentionMs()` sets the row's `expiresAt`.
- **`@modules/account/audit.ts`** — `accountAuditActions` provides the named audit actions (`AUTH_DATA_EXPORT_REQUESTED`, `AUTH_DATA_EXPORT_DOWNLOADED`).
- **`@modules/account/emails.ts`** — `recipientLocale` derives the locale for the job payload.
- **`controllers/post-account-export.ts`** — calls `requestExport`.
- **`controllers/get-account-export.ts`** — calls `openOwnExport`.

## Notes

- **Replace, don't stack.** A `ready` or `failed` row is deleted *before* the new row is inserted. A `building` row is returned as-is (no re-charge).
- **Budget before delete.** The mail-budget check (`mailRecipientRefusal`) runs before `removeRow`, so a `429` leaves the existing ready export still downloadable.
- **Inline-build self-cleanup.** A build that finishes after its row has been reaped (e.g., replaced or expired) finds no row and deletes its own file; it is not killed at the 30-min limit.
- **`emailVerified` in the job payload.** The worker uses it to decide whether to mail the link; an unverified address is treated as untrustworthy.
- **File deletion is post-commit.** In `eraseExports`, the file removal is returned as the `AfterErase` step, guaranteeing it only runs after the Mongo transaction commits.
