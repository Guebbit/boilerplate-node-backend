# src/modules/feedback/tests/integration/service.test.ts

## Purpose

Integration test suite for the feedback request service. It runs against a real database (`setupTestDb`) to pin contract-level behaviours that unit tests with in-memory fakes cannot catch: input normalisation on `create`, honeypot spam disposition, `search` filtering/pagination/meta coherence, `updateStatus` side-effects (persistence, `adminNotes` clear, `respondedAt` stamp-once semantics), and `remove`.

## Key elements

- **`makePayload(overrides?)`** – Builds a valid creation payload; each test overrides one field to isolate the behaviour under test.
- **`asSuccess` / `asReject`** – Type-narrowing casts for the union return type from the service.
- **`seed()`** – Creates three varied feedback records (two `new`, one `resolved`) for the `search` describe block.
- **`MISSING_ID`** – A fixed UUID used in negative-path tests (e.g. `remove` on a nonexistent record).
- **`describe('create')`** – Pins lowercasing, trimming, and blank-`name` → `undefined` normalisation.
- **`describe('create — honeypot')`** – Verifies spam status assignment, notification suppression, whitespace-only honeypot treated as empty, and that the `website` field is never persisted or serialised.
- **`describe('search')`** – Covers unfiltered listing, status/email/text filters, pagination meta (`page`, `pageSize`, `totalItems`, `totalPages`), and the "unknown status narrows to zero, never widens" invariant.
- **`describe('updateStatus')`** – Verifies persistence to the DB, `adminNotes` set/clear, `respondedAt` stamped only on first transition to `resolved`, and that a second resolution does not move the timestamp.
- **Mocks** – `enqueueEmail` (mailer) and `emitAuditEvent` (audit) are jest-mocked; all other collaborators hit the real database.

## Relationships

- **`src/modules/feedback/service.ts`** – Primary system under test; imports `create`, `search`, `updateStatus`, `updateStatusById`, `remove`.
- **`src/modules/feedback/repository.ts`** – Used to reload documents and verify persistence (e.g. `findByIdRaw`, `findById`, `save`).
- **`src/modules/feedback/model.ts`** – Provides the `FeedbackRequestDocument` type used in assertions.
- **`src/modules/feedback/audit.ts`** – Imports `feedbackAuditActions` (referenced for audit-event assertions).
- **`src/infrastructure/adapters/mailer.ts`** – Mocked; `enqueueEmail` call-count assertions drive honeypot tests.
- **`src/infrastructure/observability/audit.ts`** – `emitAuditEvent` replaced via `jest.requireActual` spread (same pattern as `tests/support/ports.ts`).
- **`src/infrastructure/http/response.ts`** – `ResponseSuccess` / `ResponseReject` types for result casting.
- **`src/types/index.ts`** – `FeedbackRequestStatus` enum used throughout assertions.
- **`tests/support/setup-test-db.ts`** – Initialises the real test database before any test runs.
- **`tests/support/caller-context.ts`** – Provides `testCallerContext` for service calls that require caller identity.
- **`tests/support/ports.ts`** – Source of the `observePort` helper and the canonical comment explaining the `jest.requireActual` spread mock pattern.

## Notes

- **`NODE_CONTACT_NOTIFY_EMAIL`** is set in `beforeAll` (and restored in `afterAll`) because `dotenv/config` is only loaded via `src/app.ts`, which this suite never imports. Without the explicit assignment, honeypot tests would pass vacuously—no email would be sent because no recipient is configured, not because the honeypot suppressed it.
- The `respondedAt` stamp-once test uses a first/second resolve comparison; the comment calls out that "when did we answer" must not drift on re-save.
- The `adminNotes` clear test explicitly distinguishes `!== undefined` from a truthiness check: `''` is a deliberate clear, and a `if (notes)` guard would make notes impossible to remove.
- The unknown-status search test (`'NOT_A_STATUS'`, `'NEW'`) documents a directional invariant: an unparseable filter must narrow results to zero, never fall through to "return everything."
- The file is truncated in this view; `remove` and `updateStatusById` describe blocks exist but their full assertions are not shown here.
