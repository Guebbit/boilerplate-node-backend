---
source: src/modules/account/services/export.ts
sha256: 3c3e9d642b73a3ccd7582cdb216830dc5eebb2e66cdfd4ad20de96b61474c011
generated_at: 2026-11-14T18:44:45.106108+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export.ts

## Purpose

Implements the account data-export lifecycle (GDPR Art. 15/20) as a background job rather than a synchronous request. `POST /account/export` records a `building` row and queues a build; `GET /account/export` reports status or streams the finished file. Enforces a single live export per account, applies a mail-budget charge before any new build, and participates in account erasure.

## Key elements

- **`requestExport(userId, context)`** — POST handler. Resolves the caller's account, asks the mail budget, creates/reuses the export row, dispatches the build job (queue or inline), records an audit event, and returns `202` with the row's presentation.
- **`readOwnExport(userId)`** — GET status handler. Returns the row's presentation, or `undefined` when the row is absent or past retention. A stale `building` row is reported as `failed`.
- **`openOwnExport(userId, context)`** — GET download handler. Opens the `ready` file as a `Readable` stream, records a "downloaded" audit event, and returns `{ stream, requestedDay }`; returns `undefined` for any other state.
- **`eraseExports(userId, session)`** — Implements `AfterErase` from the kernel registry. Deletes the row inside the erasure transaction; returns a post-commit thunk that removes the physical file.
- **`settleInlineExports()`** — Test/shutdown helper. Awaits any builds running in-process via `settleWithin`, capped at 30 s.
- **`inlineBuilds`** (module-private `Set<Promise>`) — Tracks inline builds (when no broker picks up the job) so they can be settled or observed.
- **`insertRow(userId)`** — Inserts a `building` row; on duplicate-key race, fetches and returns the winning row with `created: false`.
- **`rowOrRefusal(userId, email, context)`** — Core decision: returns an existing fresh `building` row, or (after consulting the mail budget) deletes a prior row and inserts a new one. A budget refusal short-circuits before deletion.
- **`dispatch(job)`** — Publishes the job to the `ACCOUNT_EXPORT` queue channel; if no broker accepts, runs `runExportJob` inline (non-awaited) and tracks the promise in `inlineBuilds`.
- **`EXPORT_BUILD_LIMIT_MS`** (30 min) — Staleness threshold for a `building` row.
- **`isStale(row)`** — Returns `true` when `Date.now() - row.createdAt > EXPORT_BUILD_LIMIT_MS`.

## Relationships

- **`src/infrastructure/adapters/export-store.ts`** — `openExport` streams the finished JSON file; `removeExport` deletes it on replacement or erasure.
- **`src/infrastructure/adapters/queue.ts`** — `publishToQueue` is the primary dispatch path for the build job.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` logs inline-build failures.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` builds the `202` response; `ResponseSuccess`/`ResponseReject` are the union type all public functions return.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` logs "requested" and "downloaded" events.
- **`src/infrastructure/persistence/mongo-errors.ts`** — `isDuplicateKey` distinguishes the race-losers in `insertRow`.
- **`src/infrastructure/runtime/settle.ts`** — `settleWithin` bounds the wait in `settleInlineExports`.
- **`src/domain-primitives/time.ts`** — `MINUTE_MS` constant used to derive the 30-minute build limit.
- **`src/kernel/registry.ts`** — `AfterErase` type shapes `eraseExports`'s return; `PersonalDataSection` (referenced in the module doc) is how sibling modules contribute data sections without this file importing them.
- **`src/modules/account/config.ts`** — `exportRetentionMs()` sets each row's `expiresAt`.
- **`src/modules/account/audit.ts`** — `accountAuditActions` supplies the audit action identifiers.
- **`src/modules/account/emails.ts`** — `recipientLocale` resolves the locale for the mailed link.
- **`src/modules/account/mail-budget.ts`** — `mailRecipientRefusal` gates a new build on remaining mailbox budget.
- **`src/modules/account/controllers/post-account-export.ts`** — HTTP controller that calls `requestExport` (with `requireFreshAuth` mounted upstream).
- **`src/modules/account/controllers/get-account-export.ts`** — HTTP controller that calls `readOwnExport` and/or `openOwnExport`.

## Notes

- **Single-export invariant** is enforced by a unique index on `userId`; the duplicate-key path in `insertRow` returns the winner rather than erroring.
- **Mail budget is charged before deletion** of a prior `ready`/`failed` row. A refusal leaves the existing download intact.
- **Inline builds are fire-and-forget** from the caller's perspective (response returns immediately), but the promise is tracked so `settleInlineExports` and process shutdown can await it. A rejection is logged, never re-thrown.
- **Erasure is two-phase**: the row delete is transactional; the file delete runs in the returned post-commit thunk because a file cannot participate in a MongoDB transaction.
- **`presentExport`** (from `../presenter`) is the single mapping from row + status to the wire shape; both status and download paths go through it.
- The module doc references `./export-job.ts` and `./personal-data-registry.ts` for the data-collection side; those files hold the `collect` logic that feeds each section's data into the export.
