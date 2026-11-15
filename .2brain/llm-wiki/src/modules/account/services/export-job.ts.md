---
source: src/modules/account/services/export-job.ts
sha256: d84ec7d8cdd2130aa50902eb83e20e47983226aaaea7a3d1af902c772707cf92
generated_at: 2026-11-14T18:44:10.879972+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export-job.ts

## Purpose

Implements the account data-export worker: it streams each registered `PersonalDataSection` into a single JSON file one at a time (capping peak memory at the largest section rather than the whole export), writes the file to the private export store, atomically settles the row and publishes the readiness/failure event, then mails the download link or a failure notice to the requester. Exposes a single entry point, `runExportJob`, consumed by the `worker.account.export` queue or inline from `./export.ts` when no broker is present.

## Key elements

- **`appendSections`** (private) — Iterates registered sections in declaration order, awaiting each `collect` call and appending the result to the open JSON object via the `AppendExport` callback. Omits sections that resolve `undefined`; throws if any section rejects or if no `profile` section answered. Closes the object with an `exportedAt` timestamp.
- **`mailRequester`** (private) — Resolves the user by `job.userId` and, if the account still exists, sends mail via `sendAccountMail`. Skips silently for erased accounts.
- **`mailLink`** (private) — Builds the "export ready" email (with retention days) and delegates to `mailRequester`.
- **`settleAnnouncing`** (private) — Wraps `accountExportRepository.settleBuilding` + `announceInTransaction` so the row status change and the outbox event (`ACCOUNT_EXPORT_READY` / `ACCOUNT_EXPORT_FAILED`) commit atomically. Returns the settled row or `null` if the row was no longer `building`.
- **`buildAndSettle`** (private) — Calls `writeExport` with `appendSections`, then `settleAnnouncing(row, 'ready')`.
- **`removeFileIfRowGone`** (private) — Deletes the half-built file only when the row no longer exists (replaced or erased mid-build).
- **`afterBuild`** (private) — If this run settled the row, mails the link; otherwise cleans up the orphaned file. Mail errors are logged, not thrown.
- **`mailFailure`** (private) — Sends the "export failed" notice; swallows mail errors with a log entry.
- **`fail`** (private) — Logs the error, settles the row to `failed`, increments `accountExportFailedTotal`, removes the partial file, and mails the requester.
- **`runExportJob`** (exported) — The queue entry point. Guards on `row.status === 'building'`, resolves the subject from the live user record, then runs `buildAndSettle` → `afterBuild` on success or `fail` on error. Always resolves `true` (ack) for business failures; only unhandled database rejections propagate to requeue the job.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `PersonalDataSection` and `PersonalDataSubject` types that define the streaming collection contract.
- **`src/modules/account/services/personal-data-registry.ts`** — Supplies `personalDataSections()`, the ordered list of sections to collect.
- **`src/infrastructure/adapters/export-store.ts`** — Provides `writeExport` / `removeExport` / `AppendExport` for the streaming file I/O behind `appendSections` and cleanup.
- **`src/kernel/outbox.ts`** — `announceInTransaction` is the mechanism that pairs the row settlement with the domain-event publish in one unit of work.
- **`src/modules/account/repository.ts`** — `accountExportRepository` performs `findById` and `settleBuilding`; the `AccountExportRow` type is the row shape threaded through every function.
- **`src/modules/account/emails.ts`** — `exportReadyEmail`, `exportFailedEmail`, and `greetableName` produce the mail bodies and the account-appropriate greeting.
- **`src/modules/account/services/mail.ts`** — `sendAccountMail` is the transport for both success and failure notifications.
- **`src/modules/account/config.ts`** — `exportRetentionMs` determines the retention window shown in the ready email and the row's expiry.
- **`src/modules/account/events.ts`** — `ACCOUNT_EXPORT_READY` / `ACCOUNT_EXPORT_FAILED` event names published via the outbox.
- **`src/modules/account/metrics.ts`** — `accountExportFailedTotal` counter incremented on each failure.
- **`src/infrastructure/adapters/logger.ts`** — Structured error logging for build failures and un-queued mail.
- **`src/domain-primitives/time.ts`** — `DAY_MS` converts the retention millisecond value to a human-readable day count.
- **`src/modules/account/services/export.ts`** — The inline (no-broker) path that calls `runExportJob` directly.
- **`src/modules/account/tests/integration/export.test.ts`** — Integration tests exercising the full build → settle → mail cycle.

## Notes

- **Streaming invariant.** Sections are collected strictly one-at-a-time and appended immediately. Peak memory is the largest single section, never the full export. Do not refactor `appendSections` to buffer all values before writing.
- **`undefined` vs. rejection.** A section resolving `undefined` is silently omitted (the `tasks` opt-out pattern). A section that *rejects* fails the entire build — an incomplete Art. 15 response must never be presented as complete.
- **Profile is mandatory.** If no section named `'profile'` answered, `appendSections` throws. An export without a profile is considered invalid.
- **Two-argument `then`, not `.catch()`.** In `runExportJob`, success and failure are separated via `then(onFulfilled, onRejected)` so that a post-settle mail failure in `afterBuild` does not cascade into `fail` (which would delete a good file and mark the row `failed`).
- **Idempotency / at-most-once mail.** Only a row still in `building` status is processed, and only the run that successfully settles it mails the link. A second delivery of the same queue message is a no-op.
- **Mail failure is non-fatal.** If `sendAccountMail` cannot queue the message, the error is logged and the row remains in its correct state (`ready` or `failed`). The file is still downloadable; the user can re-request to get a fresh link.
- **Subject is read from the live user, not the queue payload.** The `PersonalDataSubject` is derived from `accountUserService.getById` at run time, ensuring the `tasks` section matches against the account's current verified address.
