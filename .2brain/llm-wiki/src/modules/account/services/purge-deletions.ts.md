---
source: src/modules/account/services/purge-deletions.ts
source_sha256: b19962c41c6224685a53cd5f94a7c18bd09630d3e5d103e4c47929b95edc1759
context_sha256: f5aeb7303ff342f0abce7067e1e6c8a3b1c52c9508fb4ab01f804fca720d557f
generated_at: 2026-11-22T03:40:25.950019+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/purge-deletions.ts

## Purpose
Erases every account whose self-deletion grace period has expired. The `reap:scheduled-deletions` job runs it hourly. Only this purge discharges GDPR Art. 17. The lock applied at request time is only a restriction.

## Key elements
- `PurgeCounts` (interface): the result of one run, with `purged` (accounts erased), `skipped` (restored between the read and the erase) and `failed` (erasure threw; the account stays due and the next run retries it).
- `purgeOne(user)` (internal): erases one account through `accountUserService.eraseScheduledDeletion` using a system caller context. It resolves to `'purged'`, `'skipped'` or `'failed'`.
  - If the erase returns falsy, the result is `'skipped'` and nothing else happens.
  - On success it records an audit entry for account-deletion completion, increments `authAccountDeleteTotal` with status `purged`, and sends the "account deleted" email.
  - On a throw it increments the metric with status `failure`, logs the error, and returns `'failed'`.
- `purgeScheduledDeletions()` (exported): reads the due accounts with `findDueScheduledDeletions(new Date())`, then runs `purgeOne` on them sequentially. It logs a summary and returns the `PurgeCounts`.

## Relationships
- `src/modules/users/index.ts` and `src/modules/users/model.ts`: provide the `UserDocument` type. `src/modules/users/friends/account.ts` supplies `accountUserService`, with the due-account query and the erase operation.
- `src/kernel/permissions.ts`: `systemCallerContext('User')` builds the caller context for the erase and the audit entry.
- `src/infrastructure/observability/audit.ts` and `src/modules/account/audit.ts`: `recordAudit` records the audit entry, using the action constant exported by the account audit module.
- `src/modules/account/metrics.ts`: the `authAccountDeleteTotal` counter.
- `src/modules/account/emails.ts` and `src/modules/account/services/mail.ts`: `accountDeletedEmail`, `greetableName` and `recipientLocale` build the goodbye email, and `sendAccountMail` sends it.
- `src/infrastructure/adapters/logger.ts`: logs per-account failures and the run summary.
- `src/modules/account/jobs.ts`: the job runner is the intended caller. This file does not import it, so the relationship comes from the module docs.

## Notes
- The email address, locale and name are copied before the erase. After a hard delete there is no document left to read them from.
- The email is sent fire-and-forget (`void`). `sendAccountMail` is documented as never rejecting, because `enqueueEmail` logs its own failures.
- The due query uses app time (`new Date()`), not database time, because the demo clock moves only the app's clock.
- The caller must register every module's erase hooks, boot translations, and hold the job's lease. This file does none of these.
- A failed account does not stop the rest of the run.
