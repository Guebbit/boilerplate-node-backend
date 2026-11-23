---
source: src/modules/notifications/tests/integration/staff.test.ts
source_sha256: 68344cc7a5fbae0e476fc92d7b8ac30c8a48d4bca48014da38e2150bf093c912
context_sha256: c22bcc239244755bfff0e99cdd4a1d096bb7061524f05185eab24b951f212e97
generated_at: 2026-11-22T05:57:50.103686+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/integration/staff.test.ts

## Purpose
Integration test for staff "work notices". It registers the real enabled modules, emits domain events, and checks what lands in each member's notification bell. It covers who gets notified, deduplication on redelivery, mail behavior, role- and tenant-based visibility, retention, and the data export.

## Key elements
- **Mocked `enqueueEmail`** (`mockEnqueueEmail`): replaces the mail queue so cases can assert which mail was enqueued. It is reset in `beforeEach`.
- **`setupTestDb()`**: sets up the test database.
- **`beforeEach` / `afterEach`**: `beforeEach` calls `resetDomainEvents()` and `registerModules(enabledModules)`. `afterEach` calls `resetDomainEvents()` again.
- **`staff(role, email, locale?)`**: creates a user with the given role and `authenticatorEnabledAt` set, so the account counts as able to act.
- **`readerAs(role, userId)`**: builds a tenant-scoped caller in `DEPLOYMENT_TENANT_ID` via `callerInScope` and `asRole`.
- **`bellOf(role, userId)`**: returns `notificationsService.listVisible(...).items` for that reader.
- **`disabled(subscriptionId?, disabledAt?)`**: builds a `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` payload.
- **Test groups**:
  - *Webhook subscription auto-disabled*:
    - Managers are notified (`notifications.staff.webhook-disabled`, `audience: 'staff'`), moderators are not, and no mail is sent.
    - Redelivery of the same event does not notify twice, but a later `disabledAt` does notify again.
    - Accounts without an authenticator app, and banned accounts, get nothing.
  - *Outbox event dead* (`OUTBOX_EVENT_DEAD`):
    - Only admins are notified, with code `notifications.staff.outbox-dead` and severity `error`.
    - Dedup is per `eventId`.
  - *Reader's current role*:
    - A member whose role changes to `support` no longer sees the notice in the list, and a lookup by id returns 404.
    - A reader in another tenant sees nothing.
    - Staff and own messages share one list, newest first.
  - *Retention*: tests the env overrides `NODE_NOTIFICATIONS_STAFF_MAX_PER_USER` and `NODE_NOTIFICATIONS_STAFF_TTL_DAYS`.
  - *Data export*: `listStaffNotices` returns only `{code, createdAt}`, and `list` excludes staff notices.

## Relationships
- Drives `notificationsService` (`listVisible`, `get`, `list`, `listStaffNotices`) from `modules/notifications/services` and reads `notificationModel` from `modules/notifications/model` directly.
- Emits `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` (from `modules/webhooks`) and `OUTBOX_EVENT_DEAD` (from `kernel/outbox`) through `emitDomainEvent` and `resetDomainEvents` in `kernel/events`.
- Wires production behavior with `registerModules` (`kernel/registry`) and `enabledModules` (`src/modules.ts`).
- Mocks `enqueueEmail` from `infrastructure/adapters/mailer`.
- Uses `callerInScope` (`kernel/permissions`), `DEPLOYMENT_TENANT_ID` (`kernel/access/tenant`), and `asRole` (`tests/support/callers`) to build callers.
- Uses `createUser` (`users/tests/factories`) and `createNotification` (`notifications/tests/factories`) for fixtures.
- Uses `DAY_MS` (`domain-primitives/time`) for the retention life calculation.

## Notes
- Imports use the aliases `@tests/*`, `@modules/*`, `@kernel/*`, `@infrastructure/*` and `@domain-primitives/*`. `enabledModules` is imported by relative path.
- Staff notice visibility is evaluated against the reader's role at read time, not the role held when the notice was created.
- Retention is tested with a staff cap of 2 and a TTL of 10 days. This leaves the buyer's own notification unaffected, so the staff cap is separate from the buyer cap.
