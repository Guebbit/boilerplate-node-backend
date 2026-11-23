---
source: src/modules/account/services/export.ts
source_sha256: 91a8180841fa13ce8682ac13bbceeb19c32e49ab1a7e0e447c4e8278870cdea3
context_sha256: 52a7a8aac6461e67f6a3daf1b03d7e71961a9fe966f1481a90d54bb2355c9522
generated_at: 2026-11-22T03:37:26.883602+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/export.ts

## Purpose
Implements the "give me my data" flow (GDPR Art. 15/20) for `POST /account/export` and `GET /account/export`, as an asynchronous job rather than a single request. A request records a row and queues a build. A worker writes the file, and a mailed link downloads it. The file does not verify identity (`requireFreshAuth` does that on both routes) and does not change the account.

## Key elements
- `requestExport(userId, context)`: loads the caller's own account via `withOwnAccount`, then picks a row with `rowOrRefusal`. It records an audit event (`AUTH_DATA_EXPORT_REQUESTED`, with `metadata.reused` when no new row was created). It dispatches a job only for a newly created row. It returns `202` with the presented export, or the `429` budget refusal.
- `readOwnExport(userId)`: returns the caller's export status, or `undefined` if there is none or it is past `expiresAt`. A `building` row older than the build limit reads as `failed`.
- `openOwnExport(userId, context)`: returns `{ stream, requestedDay }` for a `ready`, unexpired export whose file exists, and audits `AUTH_DATA_EXPORT_DOWNLOADED`. In every other case it returns `undefined`.
- `eraseExports(userId, session)`: this module's `personalData.erase`. It deletes the row inside the erasure transaction and returns an `AfterErase` step that removes the file(s) after commit. The file is cut off in the provided content, so the step's exact body isn't shown.
- `settleInlineExports()`: waits (up to 30s) for builds running in-process. It exists for tests.
- Internal helpers:
  - `insertRow` creates a `building` row with file name `<id>.json` and an `expiresAt` from `exportRetentionMs()`. On a duplicate-key race it returns the winner's row with `created: false`.
  - `dispatch` calls `dispatchJob` on `WORKER_CHANNELS.ACCOUNT_EXPORT`. If the outcome is `'inline'`, it runs `runExportJob` un-awaited and tracks the promise in `inlineBuilds`.
  - `rowOrRefusal` and `isRow` choose between an existing row and a refusal.
  - `isStale` and `EXPORT_BUILD_LIMIT_MS` (30 minutes) decide when a `building` row counts as failed.

## Relationships
- `../repository` (`accountExportRepository`) holds the row storage. `../presenter` (`presentExport`) shapes the API output.
- `@infrastructure/adapters/job-dispatch` queues the job. `@infrastructure/adapters/export-store` provides `openExport`/`removeExport` for file access.
- `../mail-budget` (`mailRecipientRefusal`) charges or refuses a new build against the mailbox budget. `../emails` (`recipientLocale`) picks the job's locale.
- `@infrastructure/observability/audit` (`recordAudit`) together with `../audit` (`accountAuditActions`) record the audit events.
- `../config` supplies `exportRetentionMs`.
- `@infrastructure/persistence/mongo-errors` (`isDuplicateKey`) detects the insert race.
- `@infrastructure/runtime/settle` (`settleWithin`) backs `settleInlineExports`.
- `@infrastructure/http/response` supplies `generateSuccess` and the `ResponseSuccess`/`ResponseReject` types.
- `@infrastructure/adapters/logger` logs inline build failures.
- `@domain-primitives/time` supplies `MINUTE_MS`.
- `@kernel/registry` supplies the `AfterErase` type. The header comment says personal-data sections come from each owning module's `collect` (via `PersonalDataSection`), so this module need not import every contributing sibling.
- The controllers `get-account-export.ts` and `post-account-export.ts` are the route-facing callers.

## Notes
- One live export per account, enforced by a unique index. A `building` row that is not stale is returned as is, with no new job and no mail charge. A `ready` or `failed` row is replaced by a new request.
- The mail budget is checked before the old export is deleted, so a refused request leaves the existing ready export downloadable.
- Inline builds are not killed at the 30-minute limit. A late finisher finds its row gone and deletes its own file. After a deploy that cuts off an inline build, the row stays `building` until the limit passes, and the user can then ask again.
- `readOwnExport` and `openOwnExport` treat an expired-but-unswept row as nonexistent. A nightly reaper job deletes rows past `NODE_ACCOUNT_EXPORT_TTL_DAYS`.
- `requestExport` skips credentials when fetching the user (`accountUserService.getById`), because the export reads the profile and never a secret.
