---
source: src/modules/account/services/export-job.ts
sha256: 26ba2478192063f52ce888cb65ee0bfd9fea8dc3c3e5fa16791d67c6e3da8213
generated_at: 2026-11-08T04:17:37.230452+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export-job.ts

## Purpose

Implements the account-data export worker: it streams each registered `PersonalDataSection` one at a time into a JSON file (bounding peak memory to the largest single section), writes that file to the private export store, settles the `building` row to `ready` or `failed` in a single transaction that also publishes the corresponding domain event, and mails the requester a link (or a short failure notice). It runs from the `worker.account.export` queue or inline (via `./export.ts`) when no broker is configured.

## Key elements

- **`runExportJob`** (exported) — Entry point. Loads the row, verifies it is still `building`, resolves the live user, then delegates to the build/fail pipeline. Always resolves `true` (queue ack); only a thrown DB error rejects (transient requeue).
- **`appendSections`** — Iterates `personalDataSections()` in declaration order, awaiting each `collect` call and appending `"name": value` pairs to the file. `undefined` results are skipped (opt-out); a rejection throws and fails the whole build. Throws if no `profile` section answered.
- **`settleAnnouncing`** — Calls `announceInTransaction` to atomically move the row to `ready`/`failed` (with a retention deadline) *and* publish `ACCOUNT_EXPORT_READY` or `ACCOUNT_EXPORT_FAILED`.
- **`buildAndSettle`** — `writeExport` + `appendSections`, then `settleAnnouncing(row, 'ready')`.
- **`afterBuild`** — If this run settled the row, mails the link; if another run settled it (or the row vanished), calls `removeFileIfRowGone`.
- **`fail`** — Logs the error, settles the row to `failed`, increments `accountExportFailedTotal`, removes the half-built file, and mails a failure notice.
- **`mailRequester` / `mailLink` / `mailFailure`** — Resolve the account's current email via `userService.getById`, then call `sendAccountMail` with the appropriate template and greeting. Silently skip if the account no longer exists.
- **`removeFileIfRowGone`** — Deletes the file only when the row has been replaced or erased (i.e. the file belongs to nobody).

## Relationships

- **`@infrastructure/adapters/export-store`** — `writeExport` streams the file; `removeExport` deletes it on failure/supersede.
- **`@kernel/outbox`** — `announceInTransaction` couples the row-state change to the event publication in one DB transaction.
- **`@kernel/registry`** — Consumes the `PersonalDataSection` / `PersonalDataSubject` types that define the collection contract.
- **`./personal-data-registry`** — Source of the ordered section list passed to `appendSections`.
- **`../repository`** — `accountExportRepository` provides `findById` and `settleBuilding`.
- **`../emails`** — Template builders (`exportReadyEmail`, `exportFailedEmail`) and `greetableName` for personalised salutations.
- **`../events`** — Event names published on settle.
- **`../metrics`** — `accountExportFailedTotal` counter incremented on this run's failure.
- **`../config`** — `exportRetentionMs()` sets the row's expiry and is converted to days for the email copy.
- **`./mail`** — `sendAccountMail` is the transport for both success and failure notices.
- **`@domain-primitives/time`** — `DAY_MS` for converting the retention window to a human-readable day count.
- **`./export.ts`** — Sibling service that invokes `runExportJob` inline when no broker is available.
- **`tests/integration/export.test.ts`** — Integration tests exercising the full build → settle → mail path.

## Notes

- **Two-argument `then` is deliberate.** `buildAndSettle(...).then(onFulfilled, onRejected)` ensures that an error thrown *after* the row is already `ready` (e.g. mail queuing) is handled by `afterBuild`'s catch-then-log, not routed to `fail`, which would delete a good file.
- **Idempotency by row status.** Only a row whose status is `building` is processed; a second delivery of the same queue message is a no-op.
- **Mail failure is non-fatal.** A mail that cannot be queued is logged at `error` level and the job still acks; the file remains downloadable and re-requesting replaces it.
- **The account's own address is the mail target**, never the address carried in the queue payload. If the account is erased between request and build, no mail is sent.
- **`undefined` vs. rejection from a section collector** are distinct: `undefined` means "opt-out, skip this section"; a rejected promise means "the Art. 15 answer is incomplete" and fails the entire export.
