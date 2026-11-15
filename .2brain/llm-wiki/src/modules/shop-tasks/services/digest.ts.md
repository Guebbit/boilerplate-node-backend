---
source: src/modules/shop-tasks/services/digest.ts
sha256: 2f25e52e8024756d777ba9d956f65355565560cde960fcc6ad3c676a3f2650f7
generated_at: 2026-11-14T21:52:22.329513+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/services/digest.ts

## Purpose

Implements the staff digest: a scheduled (daily or weekly) pass that reads pending-work counts from each domain module, upserts or clears a per-staff summary notification, and—when a count appeared or grew—sends a single digest email. The design is idempotent; a re-run produces the same counts and emails nothing new.

## Key elements

- **`DigestRun`** (`'daily' | 'weekly'`) – discriminates which subset of summaries a run owns.
- **`Figures`** – a flat snapshot of all counts read in one pass (orders, returns, delivery, stale-refunds, low-stock).
- **`Summary`** / **`SUMMARIES`** – the static table of 10 rows, each mapping a `SummaryCode` to its run cadence and a `count` accessor on `Figures`.
- **`readFigures(now)`** – parallelises five service calls (`Promise.all`) to build the `Figures` object; thresholds come from `shopTasksConfig()`.
- **`writeSummary(summary, count, now, mailLines)`** – resolves staff recipients via `notificationsService.staffRecipients`, calls `writeSummary` per recipient, and records mail-worthy lines in the shared `mailLines` map.
- **`DigestResult`** – `{ written, cleared, mailed }` returned for the job's log line.
- **`runStaffDigest(run, now)`** *(exported)* – the public entry point: reads figures once, iterates matching summaries, clears zero-count rows, writes non-zero rows, then enqueues at most one email per staff member.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/adapters/mailer` | `enqueueEmail` – fires the per-person digest email (fire-and-forget; never throws). |
| `@kernel/access/tenant` | `DEPLOYMENT_TENANT_ID` – scopes every `notificationsService` call to the deployment tenant. |
| `@modules/delivery` (barrel → `deliveryService`) | `deliveryDigest(now, opts)` – supplies holds-open, awaiting-tracking, undelivered, and preorders-late counts. |
| `@modules/inventory` (barrel → `inventoryService`) | `listLevels({ lowOnly: true, page: 1, pageSize: 1 })` – derives the low-stock count from the response's pagination total. |
| `@modules/notifications` (barrel → `notificationsService`) | `staffRecipients`, `writeSummary`, `clearSummary` – all notification read/write operations. |
| `@modules/orders` (barrel → `orderService`) | `ordersDigest(now, opts)` – transfers-due and unshipped counts; also exports the `WITHDRAWAL_SEND_BACK_DAYS` constant. |
| `@modules/payments` (barrel → `paymentService`) | `listAttention()` – filtered to `stale_refund` items for the stale-refunds row. |
| `@modules/returns` (barrel → `returnService`) | `returnsDigest(now, opts)` – undecided and awaiting-goods counts. |
| `@modules/shop-tasks/config` | `shopTasksConfig()` – all threshold hours/days passed into the service calls. |

## Notes

- **Idempotency / email policy:** A count that is unchanged (`outcome === 'unchanged'`) never triggers an email. Only *new* or *grew* rows accumulate into `mailLines`. The route's `email` field must equal `'digest'` for the row to be mailed at all.
- **Low-stock count hack:** Rather than a dedicated count endpoint, the file fetches a single-item paginated list and reads the pagination total from the response. Cheap, but the query still hits the collection.
- **Floating promise on `enqueueEmail`:** Intentional—`enqueueEmail` logs its own failures and never rejects. The `void` + eslint-disable is the sanctioned pattern; do not wrap in try/catch.
- **`now` injection:** `runStaffDigest` accepts an explicit `Date` so tests can pin the clock; all downstream threshold math is relative to it.
- **Weekly run is tiny:** Only `preorders-late` carries `run: 'weekly'`; all other nine rows are daily.
