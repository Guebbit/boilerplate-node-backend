---
source: src/modules/notifications/services/staff.ts
sha256: 03a562ad7a1d2887ec8b1eef01f1024728158c032ed15934a415538f922f1191
generated_at: 2026-10-29T04:30:59.281416+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/staff.ts

## Purpose

Resolves the staff audience for a work notice (which members of a tenant hold the relevant permission sets) and delivers the notice to each — writing a deduplicated row and, on first delivery where the route allows, queueing an immediate email. Exists so producers can say "tell the people who do this work" without knowing who they are or how to reach them.

## Key elements

- **`StaffNotice`** (interface) — the producer-facing payload: `tenantId`, `body` (code + ids), `dedupeKey` (`<kind>:<entity>`), optional `sets` for per-notice routing.
- **`staffRecipients(tenantId, sets)`** (exported) — resolves the tenant's members holding the given sets and returns their `StaffContact[]`. Empty `sets` means administrators only.
- **`notifyStaff(notice)`** (exported) — tells every applicable recipient sequentially; returns the count of contacts reached (zero signals the caller should use a fallback mailbox).
- **`notifyStaffMember(userId, notice)`** (exported) — tells one named member (e.g. the ticket assignee), re-checking they can still act.
- **`tell`** (internal) — writes the row via `notificationsCreateStaffOnce`; if that call returns `first === true` and the route's email mode is `'now'`, queues the mail.
- **`mailNow`** (internal) — builds the email via `staffNoticeEmail` and fires `enqueueEmail`; never throws (the adapter logs its own failure).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — calls `enqueueEmail` for the "now" delivery path.
- **`src/domain-primitives/time.ts`** — uses `DAY_MS` to compute the notice TTL from config.
- **`src/modules/access/index.ts`** — calls `accessService.membersHolding` to find who in the tenant holds the required sets.
- **`src/modules/users/index.ts`** — calls `userService.staffContacts` to resolve member ids to email/locale; also imports the `StaffContact` type.
- **`src/modules/notifications/config.ts`** — reads `NODE_NOTIFICATIONS_STAFF_TTL_DAYS` for row expiry.
- **`src/modules/notifications/emails.ts`** — calls `staffNoticeEmail` to produce subject, template, and data.
- **`src/modules/notifications/staff-routing.ts`** — reads `STAFF_ROUTES` (severity, email mode) and calls `setsOfRoute` to expand per-notice sets.
- **`src/modules/notifications/services/inbox.ts`** — calls `notificationsCreateStaffOnce` to write the deduplicated notice row.
- **`src/modules/notifications/services/digest.ts`** — consumes `staffRecipients` to rebuild the daily digest audience (reverse dependency, noted in the `staffRecipients` doc comment).

## Notes

- **Sequential delivery is deliberate.** `notifyStaff` uses `for…await` so one failing write cannot mask the remaining recipients behind a parallel rejection. An audience is expected to be small.
- **Email is best-effort and cannot fail the call.** `enqueueEmail` never rejects (it logs internally); the `void` + eslint-disable is intentional. The notice row is already written before the mail is attempted.
- **Dedup gates email, not the row.** `notificationsCreateStaffOnce` is always called; only the `first === true` return triggers `mailNow`. Re-delivery of the same `dedupeKey` is a no-op for mail.
- **`sets` semantics:** an empty array means "administrators only" (the access service treats it as the admin set). The `per-notice` route mode passes caller-supplied `notice.sets` through `setsOfRoute`.
- **TTL is config-driven**, not hardcoded — read from `notificationsConfig().NODE_NOTIFICATIONS_STAFF_TTL_DAYS` at call time.
