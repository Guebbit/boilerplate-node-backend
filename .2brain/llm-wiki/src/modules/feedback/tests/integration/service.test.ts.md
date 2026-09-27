---
source: src/modules/feedback/tests/integration/service.test.ts
sha256: 99e773c902bb644efcd041667a7a941d4d6c2aa3ca7f66fb8a489c3e276c35ba
generated_at: 2026-09-27T14:54:32.220780+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/integration/service.test.ts

## Purpose

Integration test suite for the feedback request service (`create`, `search`, `updateStatus`, `remove`). Runs against a real test database to pin service-level invariants: input normalisation (lowercase email, trimmed fields, blank name → `undefined`), honeypot and disposable-email spam detection, `respondedAt` stamp-once semantics, pagination meta coherence, and status narrowing via `toFeedbackStatus`.

## Key elements

- **`makePayload(overrides?)`** — factory that returns a valid creation payload; each test varies one field at a time.
- **`seed()`** — creates three varied feedback records (two `new`, one `resolved`) for `search` tests.
- **`describe('create')`** — verifies status is always `new` on creation, email lowercasing, whitespace trimming, blank-name → `undefined`, and that a whitespace-padded single character is preserved.
- **`describe('create — honeypot')`** — asserts operator notification fires on clean submissions, spam status + no notification on a filled `website` field, whitespace-only `website` treated as empty, and that `website` is never persisted or serialised.
- **`describe('create — disposable-email policy')`** — confirms the `NODE_ANTIBOT_EMAIL_POLICY` env var is opt-in; when set to `'disposable'`, a known disposable domain is filed as `spam` with no notification.
- **`describe('search')`** — covers no-filter, status filter, email-fragment filter, free-text across name/subject/message, and pagination (`page`, `pageSize`, `totalItems`, `totalPages` consistency).
- **`describe('updateStatus')`** — verifies status change, persistence, admin-notes set/clear semantics (`''` ≠ `undefined`), `respondedAt` stamped once on first resolution and never moved.
- **Mocks** — `enqueueEmail` (mailer) and `emitAuditEvent`/`recordAudit` (audit) are `jest.mock`-ed; audit mock reroutes `recordAudit` through the spied `emitAuditEvent` to work around a closure over the real symbol.

## Relationships

- **`src/modules/feedback/service.ts`** — the unit under test; `create`, `search`, `updateStatus`, `updateStatusById`, `remove` are the functions exercised.
- **`src/modules/feedback/repository.ts`** — `feedbackRequestRepository` is used to verify persistence (`findById`, `findByIdRaw`, `save`) and to seed a `resolved` record.
- **`src/modules/feedback/audit.ts`** — `feedbackAuditActions` is imported for use in audit-related assertions.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is mocked; call counts verify notification dispatch.
- **`src/infrastructure/observability/audit.ts`** — `emitAuditEvent` and `recordAudit` are mocked (see Notes on the closure workaround).
- **`src/types/index.ts`** — `FeedbackRequestStatus` enum used throughout assertions.
- **`tests/support/setup-test-db.ts`** — initialises the in-memory/test database before the suite runs.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity for service calls.
- **`tests/support/ports.ts`** — provides the `observePort` helper and the audit-mock pattern referenced in the mock comment.
- **`tests/support/response.ts`** — `asReject`/`asSuccess` unwrap the service's result envelope in assertions.
- **`tests/support/ids.ts`** — `MISSING_ID` used in `remove` / `updateStatusById` edge-case tests.

## Notes

- **Audit mock closure workaround:** `recordAudit` in the real module closes over its own `emitAuditEvent`, so simply overriding the export is invisible to `recordAudit`. The mock re-implements `recordAudit` to call the *replacement* `emitAuditEvent` directly. This mirrors the pattern in `orders/tests/integration/cancel.test.ts` (see `tests/support/ports.ts` for the canonical explanation).
- **`NODE_CONTACT_NOTIFY_EMAIL` must be set:** `notifyMailbox()` reads this env var at call time. A service-level test suite never imports `src/app.ts` (which loads `.env` via `dotenv/config`), so the variable is set in `beforeAll`. Without it, honeypot tests would pass vacuously (no mail configured) rather than proving the honeypot suppressed the send.
- **`NODE_ANTIBOT_EMAIL_POLICY`** is read per-test and restored in `afterEach`; the policy is off by default and must be set explicitly to `'disposable'` to activate the disposable-domain check.
- **`respondedAt` is set-once:** once a record reaches `resolved`, re-resolving it must not update the timestamp. Tests assert `toBeInstanceOf(Date)` on first resolve and that a second resolve does not change the value.
- **Admin-notes clearing uses `!== undefined`, not truthiness:** an empty string `''` is a deliberate clear; a truthy guard would make notes impossible to remove.
- **`website` (honeypot) is never in the API surface:** tests confirm it is absent from both the serialised DTO (`toJSON()`) and the raw DB row (`findByIdRaw`).
