---
source: src/modules/account/services/export-job.ts
sha256: 00de9c7f2f740012fd50ab598c04c3bddae4102fcfc0677061bbdee625b3b3ab
generated_at: 2026-10-15T09:59:51.680843+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export-job.ts

## Purpose

The export worker for a single account's Art. 15 data export. It collects every registered `PersonalDataSection` **sequentially** (one at a time, appending to the file as each arrives), writes the result to the private export store, and mails the download link to the requester. Invoked from the `worker.account.export` queue or inline via `./export.ts` when no broker is present. Its core design goal is bounding peak memory to the largest single section rather than the full export object.

## Key elements

- **`runExportJob(job)`** *(exported)* — Entry point. Loads the row; if it is not `building`, acks immediately. Otherwise calls `buildAndSettle` and wires `afterBuild` / `fail` via a two-argument `.then`. Always resolves `true` (ack) unless a transient DB error rejects.
- **`appendSections(sections, subject, append)`** — Iterates registered sections in declaration order, calling `section.collect(subject)`. Skips `undefined` (opt-out), throws on reject. Requires at least one `profile` section to have answered. Writes a single JSON object with an `exportedAt` timestamp.
- **`buildAndSettle(job, row)`** — Calls `writeExport` + `appendSections`, then settles the row to `ready` with a retention deadline.
- **`afterBuild(job, row, settled)`** — If this run settled the row, mails the link; otherwise calls `removeFileIfRowGone` (sibling already settled or row erased).
- **`fail(job, row, error)`** — Logs the error, settles the row to `failed`, increments `accountExportFailedTotal`, removes the half-built file, and mails a failure notice.
- **`mailRequester(job, build)`** — Resolves the user via `userService`; if the account is gone, skips. Otherwise sends via `sendAccountMail` at `high` priority.
- **`removeFileIfRowGone(row)`** — Checks whether the row still exists; only deletes the file if it does not (orphaned by replacement/erasure).
- **`PROFILE_SECTION`** — Constant (`'profile'`); the one section whose absence makes the export invalid.

## Relationships

- **`export-store.ts`** — `writeExport` / `removeExport` / `AppendExport` are the sole I/O primitives for the export file.
- **`personal-data-registry.ts`** — `personalDataSections()` supplies the ordered list of sections to collect.
- **`repository.ts`** — `accountExportRepository` handles row lookups, `settleBuilding`, and status transitions.
- **`config.ts`** — `exportRetentionMs()` drives both the `ready`/`failed` retention timestamps and the "expires in N days" copy in the ready email.
- **`emails.ts`** — Provides `exportReadyEmail`, `exportFailedEmail`, and `greetableName` for the mail bodies.
- **`mail.ts`** — `sendAccountMail` is the transport for all outbound mail.
- **`metrics.ts`** — `accountExportFailedTotal` incremented on each failed build.
- **`logger.ts`** — Structured error logging for build failures and mail-queue failures.
- **`registry.ts`** — Source of the `PersonalDataSection` / `PersonalDataSubject` type contracts.
- **`users/index.ts`** — `userService.getById` used to check whether the requester still exists before mailing.
- **`types/index.ts`** — `AccountExportJobPayload` is the queue message shape consumed by `runExportJob`.
- **`export.ts`** — The inline (no-broker) path that ultimately calls `runExportJob`.
- **`module.ts`** — Registers the export worker in the account module's dependency graph.
- **`export.test.ts`** — Integration test covering the full build → settle → mail flow.

## Notes

- **Two-argument `.then` is deliberate.** `buildAndSettle.then(onFulfilled, onRejected)` ensures a mail-queue failure in `afterBuild` does *not* reach `fail`, which would delete an already-good export file. A trailing `.catch` would conflate the two.
- **Failure is a row state, not an exception.** A build that throws settles the row to `failed`, logs, increments the metric, and mails a short notice. The queue acks (`true`) so it is not redelivered. Only a *database* rejection propagates and triggers requeue.
- **`undefined` vs. rejection.** A section resolving `undefined` is silently omitted (opt-out pattern); a section that *rejects* fails the entire build. An incomplete Art. 15 answer must never be presented as complete.
- **Idempotency guard.** `runExportJob` checks `row.status !== 'building'` before doing any work, making duplicate delivery safe.
- **Mail failure is non-fatal.** If the ready/failure email cannot be queued, it is logged and the row/file stay intact—the user can still request again to get a fresh link.
