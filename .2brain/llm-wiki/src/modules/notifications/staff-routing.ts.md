---
source: src/modules/notifications/staff-routing.ts
sha256: c7aa40625ed779c1ec8ea418ad0190117a35eb80c44f6e2d250e5a580b87cf82
generated_at: 2026-10-29T04:31:52.896599+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/staff-routing.ts

## Purpose

Single-source routing table for staff work notices. For every `StaffNotificationCode` it declares **who** hears it (permission sets), **how loudly** (email now / digest / bell only), and **where** the notice links. It is the one file to read when auditing "who is told what" and why.

## Key elements

- **`StaffRoute`** (interface) — shape of a route: `sets` (permission-set names, `'per-notice'`, or `[]` for admins-only), `email` (`'now' | 'digest' | 'none'`), `severity`.
- **`STAFF_ROUTES`** (const) — exhaustive `Record<StaffNotificationCode, StaffRoute>`; adding a new code without a route is a compile error.
- **`setsOfRoute(route, named?)`** — resolves the effective permission-set list; for `'per-notice'` routes it returns the producer-supplied `named` list (empty → admins only).
- **`StaffNoticeBody`** (type) — `NotificationBody` narrowed to staff codes, used as the parameter type for link resolution.
- **`StaffLink`** (interface) — `{ template, parameters }` describing the admin-page path and its placeholder values.
- **`SUMMARY_PAGES`** (const, module-private) — maps each `StaffSummaryCode` to its list-page path (e.g. `'sales/orders'`).
- **`outboxAggregateLink(eventName, aggregateId)`** (const, module-private) — derives a detail-page link from the first segment of an outbox event name; falls back to `{ template: '' }` for unknown aggregates.
- **`staffLinkOf(body)`** — resolves the frontend screen a given notice points at (user, webhook, ticket, return, outbox event, or the summary list page).
- **`callerHoldsAnySet(caller, sets)`** — live permission check: true if the caller is unrestricted or holds any of the listed sets.

## Relationships

- **`src/kernel/ability.ts`** — imports `holdsSet`, used by `callerHoldsAnySet` to evaluate permission membership at read time.
- **`src/modules/notifications/model.ts`** — imports `NotificationBody`, `StaffNotificationCode`, `StaffSummaryCode` types that key this module's records.
- **`src/types/index.ts`** — imports `NotificationSeverity` and the `Caller` type (the latter re-exported from `src/types/auth-context.ts`).
- **`src/modules/notifications/services/staff.ts`** — consumes `STAFF_ROUTES`, `setsOfRoute`, `staffLinkOf`, and `callerHoldsAnySet` when writing and reading staff notices.
- **`src/modules/notifications/services/digest.ts`** — reads `STAFF_ROUTES[ code ].email === 'digest'` to decide which rows appear in the daily digest.
- **`src/modules/notifications/emails.ts`** — honors the `email: 'now'` flag to send an immediate per-recipient mail.
- **`src/modules/notifications/services/inbox.ts`** — the bell-only path; renders notices where `email: 'none'` and the caller passes `callerHoldsAnySet`.
- **`src/modules/notifications/tests/unit/staff-routing.test.ts`** — unit tests for the routing table, link resolution, and set checks.

## Notes

- `sets: []` (empty array) is the explicit "administrators only" convention; it is **not** the same as `'per-notice'` with no named sets (which also defaults to admins-only but for a different reason: the producer chose not to name a set).
- `email: 'now'` means exactly **one** mail per recipient, sent at creation. `'digest'` means a row in the daily digest that is re-sent when the count appears or grows. `'none'` is bell-only.
- `STAFF_ROUTES` is a `Readonly` record keyed by `StaffNotificationCode`, so the type system guarantees every code has a route; there is no runtime fallback.
- `outboxAggregateLink` deliberately returns an empty template (no link) for unrecognized aggregate types rather than guessing a path.
- The `Caller` type carries an `unrestricted` flag; `callerHoldsAnySet` short-circuits to `true` for unrestricted callers before touching `holdsSet`.
