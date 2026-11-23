---
source: src/modules/account/services/export-job.ts
source_sha256: 933ebca3ee95efb678107d422e606e613c71d5056b493d2008632d898bc7437e
context_sha256: bdea2093ee473dc72b026428ca96d5c5bbd0e63cf69456d0323ace63794f9f57
generated_at: 2026-11-22T03:36:54.242626+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/export-job.ts

## Purpose
The export worker for the account module. It builds one account's personal-data export, streams it into the private export store, marks the export row `ready`, and mails the requester a download link. It runs from the `worker.account.export` queue, or inline after the response when there is no broker. Failure is recorded as a `failed` row, not hidden.

## Key elements
- `runExportJob(job)` — the only export. It loads the export row by `job.exportId` and returns `true` immediately unless the row is still `building`. It then loads the account (a missing account fails the job) and calls `buildAndSettle(personalDataSubjectOf(user), row)`. Success goes to `afterBuild` and a thrown error goes to `fail`. It resolves `true` (ack) once the job is settled either way. A thrown database error is left to reject, so the queue requeues it.
- `appendSections` — collects each registered `PersonalDataSection` one at a time and appends it to the file as a `"name": value` JSON member. This keeps peak memory at the largest single section. A section that resolves `undefined` is omitted. A section that rejects fails the build. A missing `profile` section also fails the build. It closes the object with `exportedAt`.
- `buildAndSettle` — calls `writeExport` with `appendSections`, then `settleAnnouncing(row, 'ready')`.
- `settleAnnouncing` — moves a `building` row to `ready` or `failed` through `accountExportRepository.settleBuilding`, with a new expiry of now plus `exportRetentionMs()`. The move and the `ACCOUNT_EXPORT_READY` or `ACCOUNT_EXPORT_FAILED` outbox event happen in one transaction (`announceInTransaction`). It returns `null` if the row was no longer `building`.
- `afterBuild` — if this run settled the row, it mails the link. Otherwise it calls `removeFileIfRowGone`. A mail that cannot be queued is logged, not escalated.
- `fail` — logs the error, settles the row as `failed`, increments `accountExportFailedTotal`, removes the half-built file and mails a failure notice. If another run already settled the row, it only tidies up.
- `removeFileIfRowGone` — deletes the run's file only if its row no longer exists.
- `mailRequester`, `mailLink`, `mailFailure` — mail helpers. `mailRequester` re-reads the account to get its own address and skips the mail if the account is gone. `mailLink` computes the retention in days and sends on the urgent queue. `mailFailure` sends a notice with no link, which is not urgent.

## Relationships
- `src/modules/account/services/export.ts` — the module doc names it as the place where the job runs inline when there is no broker.
- `src/modules/account/repository.ts` — provides `accountExportRepository` (`findById`, `settleBuilding`) and the `AccountExportRow` type.
- `src/infrastructure/adapters/export-store.ts` — provides `writeExport`, `removeExport` and the `AppendExport` type.
- `src/modules/account/services/personal-data-registry.ts` — `personalDataSections()` supplies the sections to collect.
- `src/kernel/registry.ts` — defines the `PersonalDataSection` and `PersonalDataSubject` types.
- `src/kernel/outbox.ts` — `announceInTransaction` publishes the ready and failed events defined in `src/modules/account/events.ts`.
- `src/modules/account/services/mail.ts` — `sendAccountMail` sends the mail.
- `src/modules/account/emails.ts` — `exportReadyEmail`, `exportFailedEmail` and `greetableName` build its copy.
- `src/modules/account/config.ts` — `exportRetentionMs`, used for the row expiry and the "days" figure in the mail.
- `src/modules/account/metrics.ts` — `accountExportFailedTotal`.
- `src/infrastructure/adapters/logger.ts` — error logging.
- `src/domain-primitives/time.ts` — `DAY_MS`.
- `src/modules/account/tests/integration/export.test.ts` — integration tests for this flow.
- `src/modules/account/module.ts` — not referenced in the file content, so no interaction is documented here.

## Notes
- The subject comes from the stored account, not the queue message. The `tasks` section matches by that address, so it must be the account's own. The mail address is likewise re-read from the account.
- `buildAndSettle(...).then(onOk, onErr)` deliberately uses a two-argument `then`. A failure after the row is `ready` (the mail) must not reach `fail`, which would delete a good file.
- Running the job twice is safe. Only a row still `building` is built, and only the run that settles it mails the link. A run that loses the race deletes its file only if the row is gone.
- A failed build is not retried by the queue. The user must ask again, which replaces the failed export.
