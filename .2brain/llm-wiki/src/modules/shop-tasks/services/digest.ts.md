---
source: src/modules/shop-tasks/services/digest.ts
sha256: c1582db059572f3774a3f1717afe85a0caa5cd33d0f82650f6e903bf5fd8a152
generated_at: 2026-11-08T08:16:28.630603+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/services/digest.ts

## Purpose

Implements the daily and weekly staff digest. Each run reads pending-work counts from the modules that own them, writes or clears a summary notification for every staff member whose role covers that work, and — when a count appeared or grew and the route specifies `digest` — sends one consolidated email per person. Re-runs are idempotent: unchanged counts neither update nor mail.

## Key elements

- **`DigestRun`** (type) — `'daily' | 'weekly'`; most summaries are daily, `preorders-late` is weekly.
- **`Figures`** (interface) — the single parallel-fetch result holding order, return, delivery, stale-refund, and low-stock counts.
- **`Summary`** (interface) — one row: its `SummaryCode`, the run that owns it, and a `count` selector over `Figures`.
- **`SUMMARIES`** (const) — the ten summary rows (transfers-due, unshipped, returns-undecided, withdrawals-awaiting-goods, delivery-holds-open, awaiting-tracking, undelivered, stale-refunds, low-stock, preorders-late) with their codes and run assignment.
- **`readFigures(now)`** (private) — fans out to five module services in parallel and shapes the result into `Figures`.
- **`DigestResult`** (interface, exported) — `{ written, cleared, mailed }` for the job's log line.
- **`writeSummary(summary, count, now, mailLines)`** (private) — resolves recipients via `notificationsService.staffRecipients`, writes one summary per contact, and appends to the per-person mail-line map when the route is `digest` and the outcome is not `unchanged`.
- **`runStaffDigest(run, now?)`** (exported) — the public entry point. Reads figures once, iterates the summaries for the given run (clearing zero-count rows, writing non-zero rows), then enqueues at most one email per person for all their new/grown lines. Returns a `DigestResult`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — calls `enqueueEmail` to deliver the per-person digest email. The promise is intentionally not awaited (the adapter logs its own failures).
- **`src/kernel/access/tenant.ts`** — imports `DEPLOYMENT_TENANT_ID`, the single tenant under which all staff notifications are scoped.
- **`src/modules/delivery/…`** — calls `deliveryService.deliveryDigest(now, { holdDays, trackingHours, undeliveredDays })` for holds, tracking, undelivered, and late-preorder counts.
- **`src/modules/inventory/…`** — calls `inventoryService.listLevels({ lowOnly: true, page: 1, pageSize: 1 })` and reads `meta.totalItems` as the low-stock count.
- **`src/modules/orders/…`** — calls `orderService.ordersDigest(now, { transferHours, unshippedDays })` for transfers-due and unshipped counts.
- **`src/modules/payments/…`** — calls `paymentService.listAttention()` and filters items where `kind === PaymentAttentionKind.stale_refund` to get the stale-refund count.
- **`src/modules/returns/…`** — calls `returnService.returnsDigest(now, decisionDays)` for undecided and withdrawals-awaiting-goods counts.
- **`src/modules/notifications/…`** — uses `notificationsService.staffRecipients` to resolve who receives a row, `notificationsService.writeSummary` to create/update the per-user notification, and `notificationsService.clearSummary` to remove a row when its count hits zero.
- **`src/modules/shop-tasks/config.ts`** — reads `shopTasksConfig()` for the threshold values (transfer hours, unshipped days, return-decision days, hold-open days, tracking-missing hours, undelivered-reminder days) passed into the module service calls.

## Notes

- The low-stock count is obtained indirectly: a `pageSize: 1` query on `listLevels` and reading `meta.totalItems` from pagination metadata, rather than a dedicated "count low stock" method.
- `enqueueEmail` is fire-and-forget by design; a failure is logged inside the mailer adapter and never propagates to the digest run. An eslint-disable comment marks the intentional floating promise.
- The `now` parameter on `runStaffDigest` defaults to `new Date()` but is overridable so tests can pin the reference instant for threshold comparisons.
- Email is sent only when `route.email === 'digest'` **and** the write outcome is not `'unchanged'`; a count that fell simply updates the row without re-mailing.
- The per-person email aggregates **all** new/grown lines into a single message (via the `mailLines` map), so a staff member who has three grown rows receives one email, not three.
