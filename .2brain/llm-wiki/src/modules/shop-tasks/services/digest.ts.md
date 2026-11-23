---
source: src/modules/shop-tasks/services/digest.ts
source_sha256: 50ad9d3bc867ef1fcce101897224aace1393a41a9e63a79eeaa7d47e99d3a9ff
context_sha256: d75c43767f90416fa864edae6af53dde3bf6248043e1e212831ae44fd38d6dae
generated_at: 2026-11-22T07:42:48.357029+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/services/digest.ts

## Purpose
Builds the daily and weekly staff digest. Each summary row is a count of pending work, read from the module that owns it through its barrel. The count is written as a notification for every staff member whose role handles that work. A count of zero removes the row. A count that fell is updated quietly. A count that appeared or grew becomes unread again and is pushed. Where the route's `email` is `digest`, it is also mailed once per person per run. The job is idempotent: re-running writes the same counts, and an unchanged count mails nothing.

## Key elements
- `DigestRun` — `'daily' | 'weekly'`. It selects which summaries a run owns.
- `DigestResult` — `{ written, cleared, mailed }`, returned for the job's log line. `written` counts recipients written, not rows.
- `SUMMARIES` — the table of summary rows. Each has a `code` (`shop-tasks.staff.*`), a `run`, and a `count(figures)` extractor. Nine are daily: transfers-due, unshipped, returns-undecided, returns-awaiting-goods, delivery-holds-open, awaiting-tracking, undelivered, stale-refunds and low-stock. `preorders-late` is the only weekly one.
- `readFigures(now)` — reads every figure once per run, in parallel:
  - `orderService.ordersDigest`, `returnService.returnsDigest` and `deliveryService.deliveryDigest`, using thresholds from `shopTasksConfig()`.
  - The stale-refund count, taken from `paymentService.listAttention()` filtered to `PaymentAttentionKind.stale_refund`.
  - The low-stock count, taken from `inventoryService.listLevels({ lowOnly, page: 1, pageSize: 1 })` as `meta.totalItems`.
- `writeSummary(...)` — looks up the route in `SHOP_STAFF_ROUTES`, fetches recipients with `notificationsService.staffRecipients(DEPLOYMENT_TENANT_ID, route.sets)`, and calls `notificationsService.writeSummary` for each one. It collects mail lines for anyone whose outcome is not `'unchanged'`. It returns the recipient count.
- `runStaffDigest(run, now = new Date())` — the entry point. It reads the figures, then for each summary of the run either calls `clearSummary` (count 0) or `writeSummary`. Finally it queues one digest email per person with `staffDigestEmail` and `enqueueEmail`. `now` is injectable for tests.

## Relationships
- `@modules/orders`, `returns`, `delivery`, `payments`, `inventory` — data sources, called through their barrels (`index.ts`). From orders it also imports `WITHDRAWAL_SEND_BACK_DAYS`.
- `@modules/notifications` — stores the summary rows, resolves staff recipients and clears rows.
- `@infrastructure/adapters/mailer` — `enqueueEmail` queues the digest mail.
- `@kernel/access/tenant` — `DEPLOYMENT_TENANT_ID` scopes every recipient lookup and notification.
- `../config` — `shopTasksConfig()` supplies the `NODE_STAFF_*` and `NODE_DELIVERY_UNDELIVERED_REMINDER_DAYS` thresholds.
- Sibling modules `../emails` and `../staff-routing` supply the email builder and the routing and page tables. `@modules/users` supplies the `StaffContact` type.

## Notes
- The return send-back overdue threshold is `WITHDRAWAL_SEND_BACK_DAYS + NODE_STAFF_RETURN_TRANSIT_DAYS`, the buyer's days plus the post's.
- Mail is fire-and-forget (`void enqueueEmail(...)`). `enqueueEmail` never rejects and logs its own failures. The notification rows are the authoritative notice.
- `result.mailed` counts the emails queued, which is one per person, not per line.
- Zero-count rows are cleared via `clearSummary(code)` and are not mailed.
