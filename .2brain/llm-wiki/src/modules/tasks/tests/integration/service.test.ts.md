---
source: src/modules/tasks/tests/integration/service.test.ts
sha256: df1cef6f02969715624b7a65e00f811c6746a4a20a42702e2b69fed86027396e
generated_at: 2026-11-08T08:40:19.110214+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/service.test.ts

## Purpose

Integration tests for the task service's public surface: `create` (field normalisation, SLA due-date, honeypot disposition, domain-event announcement, outbox row) and `mailMainMailbox` (envelope shape, threading, error swallowing). Runs against a real test database with the mailer and audit port mocked out.

## Key elements

- **`makePayload(overrides?)`** – factory returning a valid creation payload; each test overrides a single field to isolate one behaviour.
- **`describe('create')`** – pins normalisation rules (lowercase email, trim, blank-name → `undefined`, category/orderNumber passthrough, privacy 1-month due date vs 48 h SLA for others).
- **`describe('create — the announcement')`** – asserts the `task.opened` domain event carries only IDs/codes (never visitor text), omits `category` when absent, and that the service itself sends no mail.
- **`describe('mailMainMailbox')`** – verifies envelope fields, `Message-ID`/`In-Reply-To` threading for reminders, no-op for missing or system-sourced tasks, and graceful swallow of a rejected mail queue.
- **`describe('create — outbox')`** – confirms a `task.opened` row lands in `outboxEventModel`; confirms no row for honeypot-filled (spam) submissions.
- **`describe('create — honeypot')`** – empty / whitespace honeypot → normal task; filled honeypot → `TaskStatus.spam` with zero events.
- **`beforeEach`** – sets `NODE_SUPPORT_EMAIL`, registers a manual `TASK_OPENED` listener, calls `markDomainEventsWired()` so the outbox relay delivers to that listener.
- **`jest.mock` for `enqueueEmail` and the audit port** – replaces both infrastructure adapters with in-memory mocks.

## Relationships

- **`src/modules/tasks/service.ts`** – system under test; calls `taskService.create` and `taskService.mailMainMailbox`.
- **`src/modules/tasks/repository.ts`** – used directly in one test to create a system-sourced task that `mailMainMailbox` must skip.
- **`src/modules/tasks/events.ts`** – imports `TASK_OPENED` to subscribe the test's own listener.
- **`src/kernel/events.ts`** – `resetDomainEvents`, `onDomainEvent`, `markDomainEventsWired` manage the in-process event bus for the suite.
- **`src/kernel/outbox.ts`** – `outboxEventModel` queried to assert outbox rows; `settleOutboxNudges` flushes pending deliveries before assertions.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` asserted on the event payload.
- **`src/domain-primitives/time.ts`** – `oneCalendarMonthLaterUtc` used to compute the expected privacy due-date.
- **`src/infrastructure/adapters/mailer.ts`** – mocked; `mockEnqueueEmail` inspected for envelope and template args.
- **`src/infrastructure/observability/audit.ts`** – replaced by `auditPortMock()` from `tests/support/ports.ts`.
- **`tests/support/environment.ts`** – `setEnvironment` injects `NODE_SUPPORT_EMAIL`.
- **`tests/support/ids.ts`** – `MISSING_ID` for the "task is gone" test.
- **`tests/support/ports.ts`** – provides `auditPortMock` and the `observePort` helper (imported, used in truncated portion).
- **`tests/support/callers.ts`** – `callerContextAs` imported (likely used in the truncated tail of the file).

## Notes

- The suite never imports `src/app.ts`, so `dotenv/config` is absent; `NODE_SUPPORT_EMAIL` must be set explicitly in `beforeEach` or `mailMainMailbox` will read an undefined env var.
- `markDomainEventsWired()` is required because the outbox relay only fans out when the bus is marked wired; without it, `settleOutboxNudges` resolves with zero deliveries.
- The mailer mock is a plain `jest.fn().mockResolvedValue(undefined)`; the audit port mock is swapped via `jest.requireActual('@tests/ports')` to reuse the shared `auditPortMock` (same pattern as `orders/tests/integration/cancel.test.ts`).
- "Doors" (access-control / permission tests) are intentionally **not** here — they live in a dedicated test file, per the module doc-comment.
- `TaskStatus` values come from `src/types/index.ts`; the test file does not define its own status enums.
