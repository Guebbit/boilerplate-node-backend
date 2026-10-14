---
source: src/modules/feedback/tests/integration/service.test.ts
sha256: c524ec9ae1a978fa77c90788a98b536c34753b5cc1d85a9e4787fb6be6d4af4e
generated_at: 2026-10-14T15:52:30.439654+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/integration/service.test.ts

## Purpose

Integration test suite for the feedback request service (`create`, `search`, `updateStatus`, `remove`). It pins normalization rules (email lowercasing, whitespace trimming, blank-name → `undefined`), operator-mailer behaviour, honeypot and disposable-email spam disposition, search filtering/pagination, and status-transition persistence — all against a real test database rather than unit-level mocks.

## Key elements

- **`setupTestDb()`** — spins up a real (or seeded) database instance before the suite runs.
- **Mocked `enqueueEmail`** (`@infrastructure/adapters/mailer`) — replaced with `jest.fn()` so tests can assert on call count, envelope, template, and data without sending mail.
- **Mocked `@infrastructure/observability/audit`** — `emitAuditEvent` is replaced with a spy; `recordAudit` is manually rerouted through that spy because it closes over its module's own real `emitAuditEvent` (see `tests/support/ports.ts` for the pattern).
- **`makePayload(overrides?)`** — builds a valid creation payload; each test overrides one or two fields.
- **`seed()`** — creates three feedback requests with varied emails/subjects and one resolved status, used by the `search` block.
- **`describe('create')`** — normalization: lowercased email, trimmed fields, blank name → `undefined`, whitespace-only name preserved after trim.
- **`describe('create — the operator notification')`** — verifies mailer is called with correct `to`, `subject`, `template`, and `data`; verifies no call when no mailbox is configured.
- **`describe('create — honeypot')`** — spam status when `website` is non-empty; `new` status + notification when empty or whitespace-only; honeypot field never persisted or serialized.
- **`describe('create — disposable-email policy')`** — off by default (disposable domain still accepted); when `NODE_ANTIBOT_EMAIL_POLICY=disposable`, submission is filed as `spam` with no notification.
- **`describe('search')`** — unfiltered, status filter, email-fragment filter, free-text across name/subject/message, pagination meta coherence.
- **`describe('updateStatus')`** — applies status, persists to DB, records admin notes, leaves status untouched when payload omits it.

## Relationships

- **`src/modules/feedback/service.ts`** — the system under test; imports `create`, `search`, `updateStatus`, `updateStatusById`, `remove`.
- **`src/modules/feedback/repository.ts`** — imports `feedbackRequestRepository` for direct persistence verification (`findById`, `findByIdRaw`, `save`).
- **`src/infrastructure/adapters/mailer.ts`** — mocked; `enqueueEmail` is the spy target for all notification assertions.
- **`src/infrastructure/observability/audit.ts`** — mocked; `emitAuditEvent` spied, `recordAudit` rerouted (see Notes).
- **`src/modules/feedback/audit.ts`** — imports `feedbackAuditActions` for use in audit-event assertions.
- **`src/types/index.ts`** — imports `FeedbackRequestStatus` enum for status comparisons.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`.
- **`tests/support/environment.ts`** — provides `setEnvironment()` for per-test env-var manipulation.
- **`tests/support/callers.ts`** — provides `testCallerContext`.
- **`tests/support/response.ts`** — provides `asSuccess` / `asReject` for Result-type unwrapping in assertions.
- **`tests/support/ids.ts`** — provides `MISSING_ID` sentinel.
- **`tests/support/ports.ts`** — provides `observePort`; also documents the audit-mock pattern referenced in this file's comment.

## Notes

- **Audit mock is non-trivial.** `recordAudit` internally calls its own module's `emitAuditEvent`, so a simple `jest.mock` on `emitAuditEvent` alone would miss calls made through `recordAudit`. The mock re-implements `recordAudit` to call the spied `emitAuditEvent` via `actual.buildAuditEvent`. The same pattern is used in `orders/tests/integration/cancel.test.ts`.
- **Environment must be set explicitly.** Service-level suites never import `src/app.ts` (where `dotenv/config` populates `NODE_CONTACT_NOTIFY_EMAIL`). The `beforeEach` sets it to `'admin@example.com'`; without this, honeypot "no notification" tests would pass for the wrong reason (no mailbox configured rather than honeypot suppression).
- **Honeypot whitespace handling.** A whitespace-only `website` value is treated as empty (legitimate client behaviour), not as spam.
- **Disposable-email policy is opt-in.** Default (env var unset) is "off"; the test explicitly sets `NODE_ANTIBOT_EMAIL_POLICY=disposable` to activate the check.
- **`beforeEach` resets env; `afterEach` clears all mocks.** Order matters if adding tests that depend on environment state.
