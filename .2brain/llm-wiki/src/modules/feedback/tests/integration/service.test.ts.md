---
source: src/modules/feedback/tests/integration/service.test.ts
sha256: e4c19a370f246ba28efaa1738bd4bfaafdb41e335033c85bc173ed3f59f99fff
generated_at: 2026-09-23T18:42:12.091818+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/integration/service.test.ts

## Purpose

Integration test suite for the feedback request service. Pins down normalisation rules on `create`, honeypot and disposable-email anti-bot disposition, `search` filtering/pagination, `updateStatus` semantics (including `respondedAt` stamping), and `remove`. Runs against a real test database via `setupTestDb` with the mailer and audit ports mocked.

## Key elements

- **`makePayload(overrides?)`** – factory for a valid creation payload; tests override one field at a time.
- **`seed()`** – creates three varied feedback requests (one pre-marked `resolved`) for the `search` block.
- **`describe('create')`** – verifies status is always `new`, email is lowercased, all text fields are trimmed, and a blank `name` becomes `undefined`.
- **`describe('create — honeypot')`** – confirms the `website` field triggers `spam` status, suppresses `enqueueEmail`, is treated as empty when whitespace-only, and is never persisted or serialised.
- **`describe('create — disposable-email policy')`** – toggles `NODE_ANTIBOT_EMAIL_POLICY` to prove the feature is off by default and, when enabled, files `spam` with a 201-shaped result.
- **`describe('search')`** – no-filter, status, email-fragment, free-text, and pagination/meta coherence.
- **`describe('updateStatus')`** – status change, persistence, admin-notes set/clear, `respondedAt` stamped exactly once on transition to `resolved`.
- **Mailer mock** – `jest.mock('@infrastructure/adapters/mailer')` replaces `enqueueEmail` with a no-op `jest.fn()`.
- **Audit mock** – partial mock that keeps the real module exports but replaces `emitAuditEvent` and re-wires `recordAudit` to route through the spy (see Notes).

## Relationships

- **`src/modules/feedback/service.ts`** – system under test; imports `create`, `search`, `updateStatus`, `updateStatusById`, `remove`.
- **`src/modules/feedback/repository.ts`** – `feedbackRequestRepository` used to seed, reload, and assert persisted state.
- **`src/infrastructure/adapters/mailer.ts`** – fully mocked; tests assert `enqueueEmail` call count to verify notification vs. suppression.
- **`src/infrastructure/observability/audit.ts`** – partially mocked (see Notes); `emitAuditEvent` is the spy target.
- **`src/modules/feedback/audit.ts`** – `feedbackAuditActions` imported for audit-event assertions.
- **`src/types/index.ts`** – `FeedbackRequestStatus` enum used in every status assertion.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the real database connection before each run.
- **`tests/support/callers.ts`** – `testCallerContext` provides the admin context passed to service calls.
- **`tests/support/ports.ts`** – `observePort` helper (pattern shared with other suites); referenced in the audit-mock comment.
- **`tests/support/response.ts`** – `asSuccess` / `asReject` used to unwrap the service's result type.

## Notes

- **Audit mock subtlety:** `recordAudit` in the real module closes over its *own* `emitAuditEvent`, so simply overriding the export is not enough. The mock re-implements `recordAudit` to call `buildAuditEvent` from the real module and then dispatch through the *mocked* `emitAuditEvent`. The same pattern is used in `orders/tests/integration/cancel.test.ts`.
- **`NODE_CONTACT_NOTIFY_EMAIL`** must be set in `beforeAll` because the service reads it from `process.env` at call time, and `dotenv/config` (loaded via `src/app.ts`) is never imported in a service-level test. Without it, honeypot tests would pass vacuously (no recipient configured rather than the honeypot suppressing the send).
- **`NODE_ANTIBOT_EMAIL_POLICY`** is read per-call; the disposable-email block restores it in `afterEach` to avoid leaking between tests.
- **`respondedAt` is stamped once:** the test asserts that re-resolving an already-`resolved` item does not move the timestamp. This is an idempotency invariant, not just "set if null."
- **Admin notes use `!== undefined` semantics:** clearing to `''` is a deliberate operation, not a no-op. A truthiness guard in the service would break this.
