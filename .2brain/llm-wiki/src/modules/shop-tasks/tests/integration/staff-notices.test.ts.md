---
source: src/modules/shop-tasks/tests/integration/staff-notices.test.ts
sha256: 605b65dd90f991730063607e7254c9f7c8b05141f42c997b5b51f9089fc1e5d8
generated_at: 2026-11-08T08:19:01.543347+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/staff-notices.test.ts

## Purpose

Integration test that verifies the shop's staff-notification pipeline end-to-end: real modules are registered, a domain event is emitted, and the test asserts who sees a bell entry, who receives a mail, in what language, and that redelivery does not duplicate. Covers two event types — `ORDER_PURCHASE_HOLD_PLACED` and `RETURN_REQUESTED` — and proves role-based eligibility, "can-act" gating, idempotency, and locale-aware mail content.

## Key elements

- **`staff(role, email, locale?)`** — creates a user with the given role and `authenticatorEnabledAt` set, so the account qualifies as "can act."
- **`readerAs(role, userId)`** — builds a `callerInScope` caller in the deployment tenant for reading the bell.
- **`bellOf(role, userId)`** — calls `notificationsService.listVisible` and returns the items array.
- **`holdPlaced(userId, until?)`** — payload for `ORDER_PURCHASE_HOLD_PLACED`.
- **`returnRequested(returnId, reason?)`** — payload for `RETURN_REQUESTED` (defaults to `'defective'`).
- **`noticeMails()`** — filters `mockEnqueueEmail` calls to the `notifications.staff-notice` template.
- **`describe('a purchase hold placed')`** — five tests: correct audience (mod/admin yes, manager/buyer no); ineligible accounts (no 2FA or banned) get nothing; mail content (locale, link, no buyer address); idempotency (same event twice → one row, one mail); distinct events (different `until` → two notifications).
- **`describe('a return requested')`** — two tests: support gets a bell-only notice (no mail) once per request, warehouse gets none; a `'withdrawal'` reason produces no notification at all.

## Relationships

- **`src/kernel/events.ts`** — `emitDomainEvent` drives the pipeline; `resetDomainEvents` cleans between tests.
- **`src/kernel/registry.ts`** — `registerModules` wires the real shop-tasks + notifications modules into the event bus.
- **`src/modules.ts`** — supplies `enabledModules`, the canonical list of registered modules.
- **`src/modules/notifications/index.ts`** — `notificationsService.listVisible` is the read path asserted against.
- **`src/modules/notifications/tests/factories.ts`** — `countNotifications` for global row-count assertions.
- **`src/modules/orders/index.ts`** — exports the `ORDER_PURCHASE_HOLD_PLACED` event constant.
- **`src/modules/returns/index.ts`** — exports the `RETURN_REQUESTED` event constant.
- **`src/infrastructure/adapters/mailer.ts`** — mocked; `enqueueEmail` calls are inspected for recipients, locale, link, and absence of buyer addresses.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes every reader call.
- **`src/kernel/permissions.ts`** — `callerInScope` constructs the tenant-scoped caller.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds test users with optional role.
- **`src/types/index.ts`** — `ReturnReason` union used in the return payload.
- **`tests/support/callers.ts`** — `asRole` builds the base caller object.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory test database.

## Notes

- The mailer is **mocked at the module level**; assertions inspect the enqueue queue (envelope, template, payload), never actual SMTP.
- "Can act" requires `authenticatorEnabledAt` to be set **and** `active !== false`. Either missing → the account is silently excluded from notification and mail.
- Idempotency key is the event payload itself: emitting the identical payload twice yields one notification. A *different* `until` on the same buyer is a new situation and produces a second entry.
- Return notifications are **bell-only** (no email) — `mockEnqueueEmail` is expected to have zero calls for `RETURN_REQUESTED`.
- The test imports `enabledModules` from `src/modules.ts` rather than hardcoding a module list, so it exercises the same registration path production uses.
