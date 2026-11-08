---
source: src/modules/notifications/services/staff.ts
sha256: 98717e49081a1b2e29eb8d2bec3305f4f4d20b397bcc1437ad39b5660a15a24f
generated_at: 2026-11-08T06:33:37.930430+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/staff.ts

## Purpose

Implements "work notices" for shop staff: resolves who must hear about an event (by permission-set role), writes a deduplicated notice row (the authoritative record), and optionally sends a courtesy email. A mail failure is logged and never propagated, because the written row is what matters.

## Key elements

- **`StaffNotice` (type)** — Discriminated union on `route.email`. `'now'` requires a `link` (for the email); `'digest' | 'none'` do not. All variants share `tenantId`, `body`, `dedupeKey`, and optional `sets`.
- **`staffRecipients` (exported)** — Resolves the audience: members of `tenantId` holding the given permission sets → their `StaffContact[]`. Empty `sets` means administrators only.
- **`notifyStaff` (exported)** — Tells every eligible staff member **sequentially** (one failing write must not hide the others). Returns the count of contacts with an address; `0` signals nobody could be reached.
- **`notifyStaffMember` (exported)** — Tells one named user (e.g., a task assignee), re-reading their contact at call time.
- **`tell` (internal)** — Writes the notice via `notificationsCreateStaffOnce`; if it is the first write and the route says `'now'`, fires `mailNow`.
- **`mailNow` (internal)** — Queues a single email via `enqueueEmail`. Never throws; `enqueueEmail` logs its own failures.
- **`StaffNoticeFacts` (interface)** — Common fields every notice carries regardless of which producer module originates it.

## Relationships

| Neighbor | Interaction |
|---|---|
| `staff-routing.ts` | Imports `setsOfRoute` and the `StaffRoute`/`StaffNoticeBody`/`StaffLink` types that define routing semantics. |
| `services/inbox.ts` | Imports `notificationsCreateStaffOnce` — the deduplicated write that makes the notice durable. |
| `emails.ts` | Imports `staffNoticeEmail` to build the locale-aware email template and subject. |
| `config.ts` | Imports `notificationsConfig()` for the `NODE_NOTIFICATIONS_STAFF_TTL_DAYS` value. |
| `@modules/access` | Calls `accessService.membersHolding(tenantId, sets)` to find who does the work. |
| `@modules/users` | Calls `userService.staffContacts(members)` to resolve email addresses and locales. |
| `@infrastructure/adapters/mailer` | Calls `enqueueEmail` to dispatch the courtesy mail. |
| `@domain-primitives/time` | Imports `DAY_MS` to compute the notice `expiresAt` from the configured TTL. |

## Notes

- **Sequential, not parallel:** recipients are told one after another deliberately; a parallel `Promise.all` would let one rejection mask the rest.
- **Dedupe key shape:** `<kind>:<entity>` — guarantees one notice per situation per recipient regardless of how many times the event is delivered.
- **`sets` on `StaffNoticeFacts` is optional:** only meaningful when the route's `sets` field is `'per-notice'`; otherwise the route carries the sets directly.
- **`notifyStaff` return value** is the *potential* audience size (contacts with an address), not the number actually first-notified. Callers use `0` to detect "nobody reachable."
- **`link` is required only for `'now'`** emails; digest and no-email routes never need one.
