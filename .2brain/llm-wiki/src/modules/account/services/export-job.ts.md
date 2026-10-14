---
source: src/modules/account/services/export-job.ts
sha256: d45c7a041b37b9e4b68297dbc40a0d1e929006dc75ff247004e362cfb714ede5
generated_at: 2026-10-14T08:47:41.505835+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export-job.ts

## Purpose

The export worker for GDPR/Art. 15 data requests. It builds one account's export file by collecting every registered `PersonalDataSection` sequentially (one at a time to cap peak memory), writes it to the private export store, and mails the download link to the requester. Invoked from the `worker.account.export` queue or inline via `export.ts` when no broker is present.

## Key elements

- **`runExportJob(job)`** — Main entry point. Looks up the row, verifies it is still `building`, then orchestrates build → settle → mail-or-cleanup. Always resolves `true` (queue ack) for both success and failure; only a database-level throw rejects (transient requeue).
- **`appendSections(sections, subject, append)`** — Iterates sections in order, calls `section.collect()`, and appends each result as a JSON member. A section resolving `undefined` is skipped (opt-out); one that *rejects* throws and fails the entire build. Requires at least one `profile` section.
- **`buildAndSettle(job, row)`** — Wraps `writeExport` + `appendSections`, then calls `accountExportRepository.settleBuilding` to transition the row to `ready`. Returns `null` if a sibling run already settled or the row was erased.
- **`afterBuild(job, row, settled)`** — If this run settled the row, mails the link (`mailLink`). Otherwise, removes the orphaned file (`removeFileIfRowGone`).
- **`fail(job, row, error)`** — Logs the error, settles the row to `failed`, increments `accountExportFailedTotal`, deletes the half-built file, and mails a no-link notice.
- **`mailLink(job, row)`** / **`mailFailure(job)`** — Resolve the user (bail if deleted), pick a greeting via `greetableName`, and queue a high-priority mail via `sendAccountMail`. Mail-queue failures are logged, not rethrown.
- **`PROFILE_SECTION`** — Constant (`'profile'`); the one section whose absence throws.

## Relationships

- **`export-store.ts`** — `writeExport` streams the file; `removeExport` deletes it; `AppendExport` is the write callback signature.
- **`repository.ts`** — `accountExportRepository.findById` / `.settleBuilding` manage the row's lifecycle state (`building` → `ready` | `failed`).
- **`personal-data-registry.ts`** — `personalDataSections()` provides the ordered list of collectors passed to `appendSections`.
- **`config.ts`** — `exportRetentionMs()` determines how long the export file and row persist.
- **`emails.ts`** — `exportReadyEmail`, `exportFailedEmail`, `greetableName` produce the user-facing message bodies and greeting logic.
- **`mail.ts`** — `sendAccountMail` is the transport for both success and failure notices.
- **`metrics.ts`** — `accountExportFailedTotal` incremented once per confirmed failure.
- **`logger.ts`** — Error logging in `fail`, `mailFailure`, and `afterBuild` catch paths.
- **`registry.ts`** — Source of the `PersonalDataSection` and `PersonalDataSubject` types.
- **`users/index.ts` / `users/services/index.ts`** — `userService.getById` resolves the user for greeting and deletion checks.
- **`export.ts`** — The inline (no-broker) path that calls `runExportJob` after the HTTP response is sent.
- **`export.test.ts`** — Integration tests exercising the full build/settle/mail/fail cycle.
- **`incidents.test.ts`** (audit-logs) — Verifies that export failures surface in the incident/audit stream.

## Notes

- **Two-argument `.then(onFulfilled, onRejected)`** is used deliberately at the top level (not `.catch()`) so that a post-settle failure (e.g. mail not queued) never routes into `fail`, which would delete a good file.
- **Idempotency guard**: only a row still in `building` status is processed. A second delivery of the same job is a no-op that acks immediately.
- **`undefined` vs. rejection semantics**: a section returning `undefined` is a legitimate opt-out (omitted from the file); a section *throwing* means the export is incomplete and the whole job must fail—never present a partial Art. 15 answer as complete.
- **Mail failure is non-fatal**: if the link email can't be queued, the file still exists and the row stays `ready`; the user can re-request to get a fresh link. The log entry is the only record of the missed mail.
- **`greetableName`** is only used when `job.emailVerified` is true; unverified requests get an empty greeting string.
