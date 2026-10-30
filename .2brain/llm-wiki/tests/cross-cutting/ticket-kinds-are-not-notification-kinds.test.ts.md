---
source: tests/cross-cutting/ticket-kinds-are-not-notification-kinds.test.ts
sha256: d344d8b0afdfa5952e462738304262c843418df1157b3d4f35f3a13926598996
generated_at: 2026-10-29T06:50:50.248654+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/ticket-kinds-are-not-notification-kinds.test.ts

## Purpose

Guarantees that every ticket kind names a situation **distinct** from every work-notice situation. Because a ticket already alerts staff via `ticket.opened` / `ticket.assigned`, a notice code that names the same situation would produce a duplicate alert. This test enforces that invariant across the two modules.

## Key elements

- **`TICKET_ALERT_CODES`** — A `Set` holding the two notification codes that *are* the ticket alerts (`notifications.staff.ticket-opened`, `notifications.staff.ticket-assigned`). Excluded from the situation-comparison so the test doesn't flag the ticket's own codes as conflicts.
- **`kebab(kind)`** — Normalises a ticket kind (`manual_refund_owed`) to the hyphen-separated spelling used in notice codes (`manual-refund-owed`).
- **`situationOf(code)`** — Extracts the last dot-segment of a notification code (e.g. `notifications.staff.manual-refund-owed` → `manual-refund-owed`) to identify the situation it names.
- **Test: "name disjoint situations"** — Maps all non-alert notification codes to their situation, maps all `TICKET_KINDS` to kebab form, and asserts the intersection is empty.
- **Test: "canary: they exist"** — Asserts both alert codes appear in `STAFF_NOTIFICATION_CODES`, preventing the disjointness test from passing vacuously if the codes are ever removed.

## Relationships

- **`src/modules/tickets/index.ts`** — Exports `TICKET_KINDS`, the canonical list of ticket kind names used as one side of the disjointness check.
- **`src/modules/notifications/model.ts`** — Exports `STAFF_NOTIFICATION_CODES`, the full set of staff-facing notification codes used as the other side of the check.

## Notes

- The canary test is load-bearing: without it, deleting the two alert codes from the notification model would make the main test pass trivially (empty `noticeSituations`).
- The file is intentionally placed under `cross-cutting/` rather than inside either module because the invariant only holds when both modules are considered together.
- `TICKET_KINDS` uses `snake_case`; notice codes use `kebab-case`. The `kebab` helper is the only bridge between the two naming conventions in this test.
