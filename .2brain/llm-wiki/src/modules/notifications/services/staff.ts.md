---
source: src/modules/notifications/services/staff.ts
source_sha256: 37dcbe928cd2468bc9c6862965365424ab10a885db0a2b6e790e3d65e652a899
context_sha256: de68fc14808914d6ae8e25e34594028d1e315964c12854934e594f854ef321ec
generated_at: 2026-11-22T05:56:01.440108+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/services/staff.ts

## Purpose
Implements "work notices" for staff: it finds the members of a shop whose role does the relevant work and who can act today, then writes one inbox notice per recipient per situation. It may also queue an email. The notice row is the notification itself. The mail is a courtesy, and a failure to queue it is logged, never raised.

## Key elements
- `StaffNotice` (type): the input to every notice. It combines `StaffNoticeFacts` (`tenantId`, `body`, `dedupeKey`, optional `sets`) with a `route` and `link`. The type forces a `link` when `route.email` is `'now'`. For `'digest'` or `'none'` the link is optional.
- `staffRecipients(tenantId, sets)`: asks the access module for the members holding the permission sets, then resolves them to `StaffContact[]` through the users module. An empty `sets` means administrators only. It is also used by the digest's daily rewrite.
- `notifyStaff(notice)`: resolves recipients using `setsOfRoute(route, sets)` and tells them one after another. It returns the number of contacts who could act, whether or not they had already been told. Zero means nobody could be reached.
- `notifyStaffMember(userId, notice)`: tells one named member, if the users module still returns them as a contact.
- `tell` (internal): calls `notificationsCreateStaffOnce` with the body, severity, tenant, sets, `dedupeKey` and an `expiresAt` of now plus `NODE_NOTIFICATIONS_STAFF_TTL_DAYS`. If this is the first write and the route's `email` is `'now'` with a link, it sends the mail.
- `mailNow` (internal): builds the mail with `staffNoticeEmail(locale, body, link)` and fires `enqueueEmail` without awaiting it.

## Relationships
- `./inbox`: `notificationsCreateStaffOnce` does the deduplicated write. Its boolean result says whether this was the first write.
- `../staff-routing`: provides `setsOfRoute` and the `StaffRoute`, `StaffLink` and `StaffNoticeBody` types. Producers pass in the route and link, so this file keeps no table of notice codes.
- `../emails`: `staffNoticeEmail` renders the subject, template and data.
- `../config`: `notificationsConfig().NODE_NOTIFICATIONS_STAFF_TTL_DAYS` sets the notice lifetime.
- `@modules/access` (`src/modules/access/index.ts`): its `accessService` supplies the members who hold the permission sets (the roles).
- `@modules/users` (`src/modules/users/index.ts`): its `userService` supplies the contact accounts, and it exports the `StaffContact` type.
- `@infrastructure/adapters/mailer`: `enqueueEmail` queues the mail.
- `@domain-primitives/time`: `DAY_MS` converts the TTL to milliseconds.

## Notes
- Recipients are told sequentially on purpose, so one failing write does not hide the others' writes behind a parallel rejection.
- The mail is sent only when the write was the first for that `dedupeKey` and recipient, so redelivered events do not send duplicate mail.
- `mailNow` deliberately discards the `enqueueEmail` promise. A comment in the file states that it never rejects and logs its own failure.
- A notice stores its `sets`, and the code comments say a member's jurisdiction is read again at display time. `notifyStaffMember` relies on this.
