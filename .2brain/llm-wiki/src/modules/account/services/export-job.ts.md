---
source: src/modules/account/services/export-job.ts
sha256: 1c6bbd966842d6542df1d66ddbfca373381bfaced2d1f53ffaca5cc73fc495df
generated_at: 2026-10-29T02:40:41.142525+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export-job.ts

## Purpose

Worker that builds one account's GDPR-style data export by collecting registered `PersonalDataSection`s one at a time and streaming them into a file (so peak memory is the largest section, not the whole export), settles the row to `ready` or `failed` atomically with its domain event, and mails the requester a link or a failure notice. Invoked from the `worker.account.export` queue or inline (see `./export.ts`) when no broker is available.

## Key elements

- **`runExportJob`** (exported) — Entry point. Looks up the row; if it is no longer `building`, acks immediately. Otherwise resolves the user, builds the file, settles the row, and handles mail/cleanup. Always resolves `true` for business failures (so the queue acks them); only database errors reject and requeue.
- **`appendSections`** — Iterates `personalDataSections()` in order, calls each `collect(subject)`, and appends `"name": value` pairs via the `AppendExport` callback. `undefined` results are skipped (opt-out shape); a *rejected* promise fails the whole build. Throws if no `profile` section answered. Closes the JSON object with an `exportedAt` timestamp.
- **`settleAnnouncing`** — Uses `announceInTransaction` to move the row from `building` to `ready`/`failed` *and* emit the matching event (`ACCOUNT_EXPORT_READY` / `ACCOUNT_EXPORT_FAILED`) in one transaction, so the event exists exactly when the state change does.
- **`buildAndSettle`** — Pipes `writeExport` (streaming file write) into `settleAnnouncing(row, 'ready')`.
- **`mailLink` / `mailFailure`** — Wrap `mailRequester` with the appropriate email template and retention-day count.
- **`mailRequester`** — Resolves the user by `job.userId` to get the verified address; skips silently if the account was erased. Uses `greetableName` for the greeting.
- **`removeFileIfRowGone`** — Deletes the half-built file only when the row no longer exists (i.e., it was replaced or erased during the build).
- **`afterBuild`** — If this run settled the row, mails the link; otherwise cleans up the orphaned file.
- **`fail`** — Logs the error, settles the row as `failed`, increments `accountExportFailedTotal`, deletes the partial file, and mails the requester.
- **`PROFILE_SECTION`** — Constant `'profile'`; the one section whose absence is a hard error.

## Relationships

- **`./personal-data-registry.ts`** — Supplies the ordered list of `PersonalDataSection` instances via `personalDataSections()`.
- **`../repository.ts`** — `accountExportRepository.findById` / `settleBuilding` read and write the export row state.
- **`../config.ts`** — `exportRetentionMs()` drives the expiry date and the "valid for N days" line in the email.
- **`../emails.ts`** — `exportReadyEmail`, `exportFailedEmail`, and `greetableName` provide mail copy and the greeting-name rule.
- **`../events.ts`** — `ACCOUNT_EXPORT_READY` / `ACCOUNT_EXPORT_FAILED` are the event names emitted by `settleAnnouncing`.
- **`../metrics.ts`** — `accountExportFailedTotal` is incremented on every settled failure.
- **`./mail.ts`** — `sendAccountMail` is the actual transport for both success and failure mails.
- **`@infrastructure/adapters/export-store.ts`** — `writeExport` (streaming append), `removeExport`, and the `AppendExport` type handle the on-disk file.
- **`@kernel/outbox.ts`** — `announceInTransaction` guarantees the row update and event are committed atomically.
- **`@kernel/registry.ts`** — Provides the `PersonalDataSection` and `PersonalDataSubject` type contracts.
- **`@domain-primitives/time.ts`** — `DAY_MS` converts the retention ms into a day count for the email.
- **`./export.ts`** — The inline (no-broker) path that calls `runExportJob` directly after the HTTP response.
- **`../module.ts`** — Registers the `worker.account.export` queue binding that dispatches to this file.
- **`../tests/integration/export.test.ts`** — Integration tests exercising the full build → settle → mail → fail lifecycle.

## Notes

- **Streaming by design.** Sections are collected and appended one at a time; the file is never held in memory whole. `writeExport` + `AppendExport` exist for this.
- **Two-argument `.then(resolved, rejected)`** in `runExportJob` is deliberate: a failure *after* `settleAnnouncing` (i.e., the mail step) must not reach `fail`, which would delete a good file. A `.catch()` on the chain would incorrectly do so.
- **Idempotency / concurrent runs.** `settleAnnouncing` returns `null` if the row was no longer `building` when the `SETTLE` ran. The caller then either deletes the orphan file (`removeFileIfRowGone`) or does nothing. This makes the job safe to run twice.
- **Queue ack semantics.** Business failures (section rejection, missing profile, erased account) resolve `true` so the queue does not redeliver a job that will fail identically. Only unexpected I/O errors reject and requeue.
- **The subject for collection** is derived from `userService.getById(job.userId)`, *not* from the queue payload, because the `tickets` section matches by the account's verified address.
- **`undefined` vs. rejection** in section collection: `undefined` means the section opted out (valid omission); a rejection means the section errored and the entire export must fail — an incomplete Art. 15 answer must not look complete.
