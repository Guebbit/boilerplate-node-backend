---
source: src/modules/notifications/tests/integration/staff.test.ts
sha256: f56dd36e95493e3319ad1db027309d0973474c35f75656f7ac05b75cfdbcb5ab
generated_at: 2026-11-08T06:35:29.918570+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/staff.test.ts

## Purpose

Integration tests for staff (work) notifications, exercised the same way production drives them: real modules registered, a domain event emitted at one end, and the member's notification "bell" read at the other. Verifies audience targeting (which roles/sets are told), idempotent redelivery, mail-queue routing by severity, role-scoped visibility at read time, tenant isolation, retention caps and TTL, and the shape of the data-export view.

## Key elements

- **`staff(role, email, locale?)`** – creates a user with `authenticatorEnabledAt` set, so the account is "able to act."
- **`readerAs(role, userId)`** – builds a `callerInScope` in the deployment tenant for the given role and user.
- **`bellOf(role, userId)`** – returns the visible notification items (newest first) as that reader would see them.
- **`disabled(subscriptionId?, disabledAt?)`** – constructs the `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` fact payload.
- **Mailer mock** – `enqueueEmail` is replaced with a `jest.fn()`; tests assert on call/no-call, never on email body.
- **Test suites**
  - *webhook subscription auto-disabled* – manager is told, moderator is not; duplicate events produce one notice; accounts without authenticator or banned accounts receive nothing.
  - *outbox event parked as dead* – only `admin` role is told; duplicate events deduplicate; notice names the record, not its payload.
  - *bell visibility follows reader's current role* – dropping a role hides the notice (404 on lookup); cross-tenant reads return empty; buyer's `own` notices coexist with `staff` notices.
  - *retention* – staff cap (`NODE_NOTIFICATIONS_STAFF_MAX_PER_USER`) and TTL (`NODE_NOTIFICATIONS_STAFF_TTL_DAYS`) are independent of buyer caps; expired notices are pruned.
  - *data export* – `listStaffNotices` returns `{ code, createdAt }` only; `list` (buyer view) is empty.

## Relationships

- **`src/kernel/events.ts`** – `emitDomainEvent` / `resetDomainEvents` drive every scenario.
- **`src/kernel/registry.ts`** – `registerModules(enabledModules)` bootstraps the full module graph per test.
- **`src/modules.ts`** – supplies the `enabledModules` list to the registry.
- **`src/modules/notifications/services/index.ts`** – `notificationsService.listVisible`, `.get`, `.listStaffNotices`, `.list` are the SUT.
- **`src/modules/notifications/model.ts`** – `notificationModel` used for direct DB assertions (count, findOne).
- **`src/modules/notifications/tests/factories.ts`** – `createNotification` seeds buyer ("own") notices.
- **`src/modules/users/tests/factories.ts`** – `createUser` provisions test accounts.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` pins the tenant scope.
- **`src/kernel/permissions.ts`** – `callerInScope` wraps role/user into a scoped caller.
- **`src/kernel/outbox.ts`** – `OUTBOX_EVENT_DEAD` event constant.
- **`src/modules/webhooks/index.ts`** – `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` event constant.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` mocked; tests verify it is or isn't called.
- **`src/domain-primitives/time.ts`** – `DAY_MS` used to assert TTL in the retention test.
- **`tests/support/callers.ts`** – `asRole` builds the caller identity.

## Notes

- An account is "able to act" only if `authenticatorEnabledAt` is set **and** the account is `active`. The tests explicitly verify that missing either flag suppresses the notification at creation time (not just at read time).
- Deduplication is per-event-identity: re-emitting the same `disabledAt` + `subscriptionId` yields one notice, but a later `disabledAt` creates a second.
- The mailer mock resets in `beforeEach`; the only assertion on mail is call-count / absence, never content or recipient.
- `registerModules` runs in `beforeEach`, so every test gets a fresh event-bus → handler wiring; this is why `resetDomainEvents` is also called.
- The data-export test asserts `params` are absent from `listStaffNotices` output—a deliberate information-hiding guarantee.
