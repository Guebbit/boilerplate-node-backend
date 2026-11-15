---
source: src/modules/tasks/tests/integration/service.test.ts
sha256: 542756be7bcb5a740b3f4639ef3d18aa5bce290f54b587989009df5ee66c2ee3
generated_at: 2026-11-14T22:16:47.079278+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/service.test.ts

## Purpose
Integration tests for the task service's public operations: `create` (field normalisation, due-date SLA, honeypot disposition, domain-event announcement, outbox row), `mailMainMailbox` (envelope shape, threading, system-task guard, error swallowing), and the staff search / `removeById` paths. The "doors" (permission checks) are deliberately excluded and live in the service's own permission test file.

## Key elements
- **`setupTestDb()`** – boots a real Mongo instance for the suite; the file is not self-contained without it.
- **`jest.mock('@infrastructure/adapters/mailer')`** – replaces `enqueueEmail` with a resolved no-op mock so mail assertions can inspect call arguments without a live SMTP relay.
- **`jest.mock('@infrastructure/observability/audit')`** – swaps the audit port for `auditPortMock()` from `tests/support/ports.ts` (same pattern as the orders cancel suite).
- **`beforeEach` / `afterEach`** – sets `NODE_SUPPORT_EMAIL`, resets the domain-event bus, subscribes a local listener to `TASK_OPENED`, calls `markDomainEventsWired()`, and clears mocks.
- **`makePayload(overrides?)`** – factory returning a valid contact-creation payload; tests override one field at a time.
- **`describe('create', …)`** – pins status initialisation, email lowercasing, whitespace trimming, blank-name → `undefined`, category/orderNumber pass-through, and the due-date SLA (privacy = 1 calendar month; other = 48 h).
- **`describe('create — the announcement', …)`** – verifies the `task.opened` event payload contains only ids and closed codes (no visitor PII), omits `category` when absent, and that the service itself does not call `enqueueEmail`.
- **`describe('mailMainMailbox', …)`** – covers the full envelope (to, subject, reply-to, stable `messageId`), reminder threading via `inReplyTo`, no-op on missing id, no-op for system-source tasks, and graceful swallow of a rejected queue.
- **`describe('create — outbox', …)`** – asserts exactly one `task.opened` outbox row for a legitimate task and zero for a honeypot-triggered spam submission.
- **`describe('create — honeypot', …)`** – confirms spam status assignment, suppressed announcement, whitespace-only honeypot treated as empty, and that the `website` field is never persisted.

## Relationships
- **`src/modules/tasks/services/index.ts`** – the primary SUT; the test imports `taskService` and exercises its `create` and `mailMainMailbox` methods.
- **`src/modules/tasks/repository.ts`** – the test imports `taskRepository` to seed a system-source task fixture for the `mailMainMailbox` guard test.
- **`src/modules/tasks/events.ts`** – supplies the `TASK_OPENED` constant used to subscribe the local listener and to name the outbox row in assertions.
- **`src/kernel/events.ts`** – provides `onDomainEvent`, `markDomainEventsWired`, `resetDomainEvents`, and the `DomainEventMap` type that shapes the captured `opened` array.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes pending outbox dispatch before assertions; `outboxEventModel` is queried directly for row-count checks.
- **`src/domain-primitives/time.ts`** – `oneCalendarMonthLaterUtc` is the reference implementation the test compares the privacy-task `dueAt` against.
- **`src/infrastructure/adapters/mailer.ts`** – mocked; the test asserts on `enqueueEmail` call arguments (envelope, template, data).
- **`src/infrastructure/observability/audit.ts`** – mocked via `tests/support/ports.ts`; kept out of the happy-path assertions.
- **`src/modules/tasks/audit.ts`** – `tasksAuditActions` is imported (used by the audit port mock to register expected action names).
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` is the expected `tenantId` on the `task.opened` event.
- **`src/types/index.ts`** – `TaskKind`, `TaskSource`, `TaskStatus` enums used in assertions and in the system-task fixture.
- **`tests/support/callers.ts`** – `callerContextAs` (imported; used by helper setup).
- **`tests/support/environment.ts`** – `setEnvironment` injects `NODE_SUPPORT_EMAIL` without pulling in the app bootstrap.
- **`tests/support/ids.ts`** – `MISSING_ID` provides a valid ObjectId string that will never exist, for the "task is gone" guard.
- **`tests/support/ports.ts`** – `auditPortMock()` factory and the `observePort` helper that back the audit mock.

## Notes
- The file explicitly does **not** test permission/door logic; that coverage lives in a separate service test file (referenced in the module docblock).
- `NODE_SUPPORT_EMAIL` must be set manually in `beforeEach` because this suite never imports the app entry point (where `dotenv/config` runs). Forgetting this makes `mailMainMailbox` tests fail with an undefined `to` address.
- `markDomainEventsWired()` is required before any `settleOutboxNudges()` assertion; without it the outbox relay considers the bus unwired and silently drops events.
- The `!` non-null assertions on `createdAt` / `dueAt` rely on Mongoose `timestamps` being active in the test DB schema—do not remove them without confirming the fixture still stamps.
- The truncated tail (after "never persists or returns the honeypot field itself") likely contains the `staff search` and `removeById` describe blocks mentioned in the module docblock.
