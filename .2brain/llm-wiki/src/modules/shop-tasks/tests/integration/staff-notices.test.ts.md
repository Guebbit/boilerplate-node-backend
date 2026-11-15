---
source: src/modules/shop-tasks/tests/integration/staff-notices.test.ts
sha256: 44a1365141a5bba31120a168cf1781bfa5ce0034a796c0232900788fc969a3d2
generated_at: 2026-11-14T21:57:37.814044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/staff-notices.test.ts

## Purpose

Integration test that verifies the shop-tasks module routes staff notices correctly through the full pipeline: a domain event is emitted, the registered modules react, and the right people see an in-app notification and receive a locale-aware email. It intentionally uses the real module registry, event bus, and notifications service (only the mailer is mocked) to prove that role-based audience selection, "can-act" gating, idempotency, and mail routing all work end-to-end.

## Key elements

- **`staff(role, email, locale)`** – creates a user with the given role, authenticator enabled, and a locale; the "can act" precondition for receiving notices.
- **`readerAs(role, userId)`** – builds a scoped caller (tenant-scoped, role-bound) for reading another member's bell.
- **`bellOf(role, userId)`** – calls `notificationsService.listVisible` through the scoped reader and returns the items.
- **`holdPlaced(userId, until?)`** – builds the payload for `ORDER_PURCHASE_HOLD_PLACED`.
- **`returnRequested(returnId, reason?)`** – builds the payload for `RETURN_REQUESTED`; defaults reason to `'defective'`.
- **`noticeMails()`** – filters the mocked `enqueueEmail` calls to the `notifications.staff-notice` template.
- **`describe('a purchase hold placed')`** – five tests covering: correct audience (moderator + admin, not manager/customer), ineligibility without authenticator or while banned, per-locale mail with correct link and no buyer address leak, idempotency on duplicate delivery, and a new `until` value creating a fresh notice.
- **`describe('a return requested')`** – two tests: bell-only notice for support (no mail), warehouse excluded; and silence on `'withdrawal'` reason.

## Relationships

- **`src/kernel/events.ts`** – `emitDomainEvent` drives the system under test; `resetDomainEvents` clears state between cases.
- **`src/kernel/registry.ts` + `src/modules.ts`** – `registerModules(enabledModules)` wires the shop-tasks and notifications modules into the real event pipeline each test run.
- **`src/modules/notifications/index.ts`** – provides `notificationsService`, the read path the test asserts against for bell contents; not mocked.
- **`src/modules/notifications/services/index.ts`** – the service implementation behind `notificationsService` (reachable through the module's public export).
- **`src/modules/notifications/tests/factories.ts`** – `countNotifications` provides a DB-level count for the "told nobody" assertions.
- **`src/modules/orders/index.ts`** – exports `ORDER_PURCHASE_HOLD_PLACED`, the event code this test emits.
- **`src/modules/returns/index.ts`** – exports `RETURN_REQUESTED`.
- **`src/infrastructure/adapters/mailer.ts`** – the sole mock; `enqueueEmail` is spied on to verify recipients, template, locale, link, and absence of buyer PII.
- **`src/kernel/permissions.ts`** – `callerInScope` builds the tenant-scoped caller used to read a member's bell.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` pins all actors to the shop's tenant.
- **`src/modules/users/tests/factories.ts`** – `createUser` creates test users with roles and flags.
- **`src/types/index.ts`** – `ReturnReason` type constrains the reason field.
- **`tests/support/callers.ts`** – `asRole` builds a bare role-bound caller before tenant scoping.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` provisions a clean database per run.

## Notes

- **Only the mailer is mocked.** The event bus, module registry, permissions checks, and notifications service all execute for real. This is an integration test, not a unit test; the engine's own dedup/routing rules are covered in the `notifications` module's staff test (noted in the file docblock).
- **"Can act" requires both `authenticatorEnabledAt` and `active: true`.** A user who is a moderator but lacks one of these receives no notification and no mail.
- **Idempotency key includes the `until` value.** Emitting the same buyer with a later `until` is treated as a new situation (two bell rows), while a byte-identical replay yields one row.
- **Mail payloads must not contain the buyer's email.** The test asserts `JSON.stringify` of all mail payloads does not include `buyer@`.
- **Locale propagates into the mail link.** An Italian staff member gets a `/it/users/…` path; an English one gets the English equivalent.
- **`withdrawal` reason is a buyer's right and triggers no staff notice**, by design.
