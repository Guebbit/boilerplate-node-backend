---
source: src/modules/notifications/tests/integration/staff.test.ts
sha256: b4aa8f8f0fb6d0ad062a7b9f82b79a00bb4c990dc7ba8e98ed92ac46aa1227a3
generated_at: 2026-10-29T04:33:27.215770+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/staff.test.ts

## Purpose

Integration tests that drive the real module pipeline (registry → domain event → notification service → bell + mailer) to verify staff-notification semantics: which roles are told, which accounts are excluded, idempotency under redelivery, mail locale/link content, and that the bell reflects the reader's *current* role and tenant.

## Key elements

- **`staff(role, email, locale?)`** — Creates a staff user with `authenticatorEnabledAt` set (the "can act" prerequisite).
- **`readerAs(role, userId)`** — Builds a `callerInScope` context for reading the bell as `role` in `DEPLOYMENT_TENANT_ID`.
- **`bellOf(role, userId)`** — Calls `notificationsService.listVisible` and returns the `items` array.
- **`holdPlaced(userId, until?)`** — Fact object for `ORDER_PURCHASE_HOLD_PLACED`.
- **`returnRequested(returnId, reason?)`** — Fact object for `RETURN_REQUESTED`.
- **`noticeMails()`** — Filters `mockEnqueueEmail` calls to the `'notifications.staff-notice'` template.
- **`describe` blocks** — Cover four event scenarios (purchase-hold, webhook-disabled, return-requested, outbox-dead) plus a visibility/role-change suite.
- **Mock** — `@infrastructure/adapters/mailer` is replaced so `enqueueEmail` is a `jest.fn`; the test inspects the call queue (envelope, template, payload) rather than real delivery.
- **`beforeEach`** — Resets the mailer mock, clears domain events, and calls `registerModules(enabledModules)` so the production event handlers are wired.

## Relationships

- **`src/kernel/registry.ts` / `src/modules.ts`** — `registerModules(enabledModules)` activates the real notification handlers that listen to domain events.
- **`src/kernel/events.ts`** — `emitDomainEvent` fires the trigger; `resetDomainEvents` clears state between tests.
- **`src/modules/notifications/services/index.ts`** — `notificationsService.listVisible` / `.get` are the system under test for bell contents and single-item lookup.
- **`src/modules/notifications/model.ts`** — `notificationModel.countDocuments` asserts that no row was written for excluded accounts.
- **`src/infrastructure/adapters/mailer.ts`** — Mocked; assertions target the enqueued mail (recipient, template, locale, link).
- **`src/modules/orders/index.ts`** — Exports `ORDER_PURCHASE_HOLD_PLACED`.
- **`src/modules/returns/index.ts`** — Exports `RETURN_REQUESTED`.
- **`src/modules/webhooks/index.ts`** — Exports `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED`.
- **`src/kernel/outbox.ts`** — Exports `OUTBOX_EVENT_DEAD`.
- **`src/kernel/permissions.ts`** — `callerInScope` builds the tenant-scoped caller context.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes all test data and readers.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds accounts (both staff and non-staff).
- **`src/modules/notifications/tests/factories.ts`** — `createNotification` used to pre-seed a personal (non-staff) notification in the coexistence test.

## Notes

- The `staff()` helper **always** sets `authenticatorEnabledAt`; tests that need an "unarmed" account call `createUser` directly without that field.
- Idempotency is verified by emitting the *identical* event twice and asserting exactly one bell row and one mail per recipient.
- A second purchase-hold with a different `until` value is treated as a **new** notice — the dedup key includes the timestamp, not just `userId`.
- Webhook-disabled and return-requested events produce bell entries **without** mail (severity is not urgent enough); the test explicitly asserts `mockEnqueueEmail` was not called.
- The outbox-dead notice names `eventId`/`eventName`/`aggregateId` but the test confirms no payload body leaks into the notification params.
- `DAY_MS` from `src/domain-primitives/time.ts` is imported but is not used in the visible (non-truncated) portion of the file.
