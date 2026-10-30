---
source: src/modules/notifications/services/digest.ts
sha256: afa9bab5c35546634195975adba6b78cfd6888a437a9ea45d58d48511e349747
generated_at: 2026-10-29T04:30:07.464712+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/digest.ts

## Purpose

Implements the staff digest: for a given run (`daily` or `weekly`), it reads pending-item counts from the owning modules, upserts one inbox summary row per relevant staff member, and—only for lines whose route is `digest`—sends a single consolidated email per person listing lines that are new or grew. The operation is idempotent; re-running writes the same counts and mails nothing unchanged.

## Key elements

- **`DigestRun`** (type) — `'daily' | 'weekly'`; selects which subset of `SUMMARIES` to process.
- **`Figures`** (interface, module-private) — the single read per run: order, return, and delivery digests plus stale-refund count and low-stock total.
- **`Summary`** (interface, module-private) — one row: its `StaffSummaryCode`, owning run, and a `count(figures)` extractor.
- **`SUMMARIES`** (const array) — the ten rows the digest maintains; nine daily, one weekly (`preorders-late`).
- **`readFigures(now)`** (module-private) — parallel-reads all source services and returns a `Figures` object.
- **`DigestResult`** (exported interface) — `{ written, cleared, mailed }` counts for the job's log line.
- **`writeSummary(...)`** (module-private) — writes the inbox row for every recipient; collects mail-eligible lines into a shared `mailLines` map.
- **`runStaffDigest(run, now?)`** (exported function) — the public entry point called by the scheduled job; orchestrates read → write/clear → mail and returns a `DigestResult`.

## Relationships

- **`@domain-primitives/time`** — imports `DAY_MS` to compute the summary TTL expiry.
- **`@infrastructure/adapters/mailer`** — imports `enqueueEmail` to queue the per-person digest email (fire-and-forget).
- **`@kernel/access/tenant`** — imports `DEPLOYMENT_TENANT_ID`; all summaries and recipient lookups are scoped to the deployment tenant.
- **`@modules/delivery`** (barrel) — calls `deliveryService.deliveryDigest` for holds, tracking, undelivered, and late-preorder counts.
- **`@modules/inventory`** (barrel) — calls `inventoryService.listLevels({ lowOnly: true, pageSize: 1 })` and reads `meta.totalItems` as the low-stock count.
- **`../config`** — reads `notificationsConfig()` for all threshold values (transfer hours, unshipped days, hold days, tracking hours, undelivered days, return-decision days, staff TTL days).
- **`../emails`** — imports `staffDigestEmail` (builds the email template) and the `DigestItem` type used in the mail-lines map.
- **`../model`** — imports the `StaffSummaryCode` type.
- **`../staff-routing`** — imports `STAFF_ROUTES`; determines recipient sets, severity, and whether the route emits a digest email.
- **`./inbox`** — imports `notificationsWriteSummary` (upsert) and `notificationsClearSummary` (delete when count hits zero).
- **`./staff`** — imports `staffRecipients` to resolve the user list for a given route set.
- **`tests/integration/digest.test.ts`** — integration test that calls `runStaffDigest` with a controlled `now`.

## Notes

- **Low-stock count via pagination trick:** `listLevels` is called with `pageSize: 1` solely to read `meta.totalItems`; no actual rows are needed.
- **`per-notice` route:** if `route.sets === 'per-notice'`, the summary is written with empty `sets` and no recipient is resolved—this is a placeholder path distinct from normal set-based fan-out.
- **Email is fire-and-forget:** `enqueueEmail` is intentionally not awaited (see eslint-disable comment); the queue logs its own failures and the inbox rows are the source of truth.
- **Zero-count handling:** a count of 0 clears the row via `notificationsClearSummary` rather than writing a "0" summary.
- **`now` is injectable:** tests pass a fixed `Date`; production defaults to `new Date()`. All threshold arithmetic flows from this single timestamp.
