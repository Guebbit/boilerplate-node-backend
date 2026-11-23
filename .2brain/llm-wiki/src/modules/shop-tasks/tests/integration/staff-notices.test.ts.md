---
source: src/modules/shop-tasks/tests/integration/staff-notices.test.ts
source_sha256: 84e55d657abc2aa3ebf18d8db5f71dd3b977c7af57723776c5da9bda7f9fff0e
context_sha256: 93e19cf157edbfefed206a6ff415a3cb80129adc451abb6a9712f2493892ea91
generated_at: 2026-11-22T07:45:31.104805+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/tests/integration/staff-notices.test.ts

## Purpose
Integration test for the shop's staff work notices, run the way production runs them: the real modules are registered, a shop domain event is emitted, and each staff member's notification "bell" is read at the other end. It checks who gets notified, that redelivered events don't notify twice, and that email follows the route's class. The notifications engine's own rules are tested elsewhere (`notifications`' staff test).

## Key elements
- `mockEnqueueEmail`: a mock of `enqueueEmail` from the mailer adapter (the `jest.mock` replaces the module). It stands in for the mail queue so tests can assert which mail was enqueued.
- `setupTestDb()`: sets up the test database. `beforeEach` resets the mailer mock, resets domain events, and calls `registerModules(enabledModules)`. `afterEach` resets domain events.
- `staff(role, email, locale)`: creates a user with the given role and an authenticator app enabled, i.e. an account that can act.
- `readerAs(role, userId)`: builds a tenant-scoped caller (`callerInScope`, `DEPLOYMENT_TENANT_ID`) from `asRole`.
- `bellOf(role, userId)`: returns the items from `notificationsService.listVisible` for that reader.
- `holdPlaced(userId, until)` and `returnRequested(returnId, reason)`: payload builders for `ORDER_PURCHASE_HOLD_PLACED` and `RETURN_REQUESTED`.
- `noticeMails()`: filters enqueued mail calls to the `notifications.staff-notice` template.
- Suite "a purchase hold placed":
  - Notifies the moderator and the admin, but not the manager or the buyer. The notice has code `shop-tasks.staff.purchase-hold-placed`, audience `staff` and severity `warning`.
  - Skips moderators with no authenticator app or who are banned (`active: false`).
  - Mails each recipient once, in their own locale, with a link such as `/it/users/<id>`. The buyer's address must not appear in the mail params.
  - A duplicate delivery of the same fact gives one row and one mail per recipient.
  - A later hold on the same buyer, with a different `until`, counts as a new notice.
- Suite "a return requested":
  - Notifies `support` (code `shop-tasks.staff.return-requested`, with `returnId`, `orderId` and `orderNumber` params) but not `warehouse`. It sends no mail and is deduplicated across redelivery.
  - Sends nothing for a `withdrawal` reason.

## Relationships
- Boots the app's module set through `enabledModules` (`src/modules.ts`) and `registerModules` (`@kernel/registry`). It drives events via `emitDomainEvent`/`resetDomainEvents` (`@kernel/events`) using `ORDER_PURCHASE_HOLD_PLACED` (orders) and `RETURN_REQUESTED` (returns).
- Reads results through `notificationsService` (notifications module) and `countNotifications` (notifications test factories).
- Creates users with `createUser` from the users test factories, and builds callers with `asRole` (`tests/support/callers.ts`) plus `callerInScope` (`@kernel/permissions`) and `DEPLOYMENT_TENANT_ID` (`@kernel/access/tenant`).
- Mocks `@infrastructure/adapters/mailer`. `ReturnReason` comes from `@types`.

## Notes
- The "skips an account that cannot act" test calls `expect(countNotifications()).resolves.toBe(0)` twice, an identical duplicate assertion.
- Mail assertions rely on the template name `notifications.staff-notice` and on the mail's third call argument carrying `locale` and `link`.
