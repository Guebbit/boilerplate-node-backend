---
source: src/modules/tickets/tests/integration/service.test.ts
sha256: b5f824b703c7e2c0e82db4e0004e4054365afcfc0db4f7af0489f316124a523f
generated_at: 2026-10-29T06:07:50.412263+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/integration/service.test.ts

## Purpose

Integration tests for the ticket service that pin its create-time normalisation (email lowercasing, whitespace trimming, blank-name → `undefined`, category/order-number passthrough), the `ticket.opened` domain-event payload, the honeypot and disposable-email anti-automation runs, `mailFallbackMailbox`, staff search, and `removeById`. Uses a real test database so repository round-trips are exercised; the mailer and audit port are mocked.

## Key elements

- **`makePayload(overrides)`** – factory that returns a valid creation payload with one-field-at-a-time overrides for focused assertions.
- **`seed()`** – creates three varied tickets (one resolved) to support `search` and `removeById` cases.
- **`staff`** (`callerContextAs('admin')`) – the caller context used for all staff-scoped reads/moves.
- **`opened`** – module-level array that accumulates `ticket.opened` facts captured by a listener registered in `beforeEach`.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** – replaces `enqueueEmail` with a resolved `jest.fn()` so mail assertions are deterministic.
- **`jest.mock('@infrastructure/observability/audit', …)`** – swaps the audit port for `auditPortMock()` from `tests/support/ports.ts` (same pattern as `orders/tests/integration/cancel.test.ts`).
- **`beforeEach`** – sets `NODE_CONTACT_NOTIFY_EMAIL`, resets the event bus, and re-registers the `TICKET_OPENED` listener.
- **`describe` blocks** – `create`, `create — the announcement`, `mailFallbackMailbox`, `create — honeypot`, `create — disposable-email policy`, `search`, and (truncated) `removeById`.

## Relationships

- **`src/modules/tickets/service.ts`** — the system under test; `ticketService.create`, `.mailFallbackMailbox`, `.search`, `.removeById`, `.resolve` are all called here.
- **`src/modules/tickets/repository.ts`** — `ticketRepository.create` seeds a system-source ticket; `findByIdRaw` verifies the honeypot field is not persisted.
- **`src/modules/tickets/events.ts`** — provides `TICKET_OPENED`, the event the service emits and these tests assert on.
- **`src/kernel/events.ts`** — `onDomainEvent` / `resetDomainEvents` let the suite subscribe to and clear the in-memory event bus without booting the app.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` is asserted as the `tenantId` on every `ticket.opened` fact.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is fully mocked; tests assert call shape (envelope, template, data) or absence.
- **`src/infrastructure/observability/audit.ts`** — replaced by `auditPortMock()` so no real audit writes occur during the suite.
- **`src/modules/tickets/audit.ts`** — `ticketsAuditActions` imported (available for assertions on audit log shape, though not heavily exercised in the visible portion).
- **`src/types/index.ts`** — `TicketKind`, `TicketSource`, `TicketStatus` enums used in seeds and status assertions.
- **`tests/support/setup-test-db.ts`** — provisions a throwaway database before any test runs.
- **`tests/support/callers.ts`** — `callerContextAs` builds the staff/admin caller identity.
- **`tests/support/environment.ts`** — `setEnvironment` injects `NODE_CONTACT_NOTIFY_EMAIL` and `NODE_ANTIBOT_EMAIL_POLICY` per test.
- **`tests/support/ids.ts`** — `MISSING_ID` supplies a guaranteed-absent identifier for negative-path tests.
- **`tests/support/ports.ts`** — `auditPortMock()` and `observePort` provide the mock port used in place of the real audit adapter.
- **`tests/support/response.ts`** — `asReject` helper for response-shape assertions (visible in the truncated portion).

## Notes

- `NODE_CONTACT_NOTIFY_EMAIL` must be set in `beforeEach` because the service-level suite never imports `src/app.ts`, which is where `dotenv/config` would normally load it.
- The honeypot field (`website`) is asserted absent from both the returned document *and* the raw repository row — a regression guard against accidental persistence.
- Disposable-email and honeypot catches both return a `201`-shaped result (ticket stored with `status: spam`) so a spam script cannot distinguish which signal fired; tests explicitly verify this "no visible refusal" contract.
- `mailFallbackMailbox` must *not* send when the ticket's `source` is `system` (e.g. `manual_refund_owed`); only visitor-submitted tickets get a Reply-To.
- The event announcement is asserted to contain **only** ids and closed-vocabulary codes — `JSON.stringify(opened)` must not contain the visitor's name, email, or message body.
- The audit port mock follows the same pattern documented in `orders/tests/integration/cancel.test.ts`; see `tests/support/ports.ts` for the rationale.
