---
source: src/modules/feedback/tests/integration/service.test.ts
sha256: 3ae05ca7c7d777895fa168e02df7497dc1fc260c34cef4d0a604c7195a1950a4
generated_at: 2026-10-15T10:33:00.006039+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/integration/service.test.ts

## Purpose

Integration test suite for the feedback request service. It runs against a real test database (`setupTestDb`) to pin down service-level invariants that unit tests cannot: input normalisation (email lowercasing, field trimming, blank-name coercion), the one-shot `respondedAt` stamp, honeypot and disposable-email spam disposition, operator-notification side-effects, search filtering/pagination, status transitions, and removal.

## Key elements

- **`create` describe blocks** — five sub-suites: basic status/normalisation, operator notification (mailbox routing, template, suppression when unconfigured), honeypot (`website` field → `spam` status, field never persisted), disposable-email policy (`NODE_ANTIBOT_EMAIL_POLICY`), and whitespace-honeypot edge case.
- **`search` describe block** — verifies unfiltered listing, status/email/text filters, and pagination meta consistency (`totalPages` derived from `totalItems`, not page size).
- **`updateStatus` / `updateStatusById` describe block** — status transition, `adminNotes`, persistence beyond in-memory mutation, and no-op when payload omits `status`.
- **`remove` describe block** — (truncated) deletion via service.
- **`makePayload(overrides)`** — factory for a valid creation payload; each test overrides one field.
- **`seed()`** — creates three varied feedback rows (two `new`, one `resolved`) for search tests.
- **Audit mock** — partial mock of `@infrastructure/observability/audit` that preserves the real module surface but reroutes `recordAudit` through a local `emitAuditEvent` spy (see Notes).
- **Mailer mock** — `enqueueEmail` replaced with a resolved `jest.fn()`; assertions inspect `mock.calls[0]`.

## Relationships

| Neighbor | Role in this file |
|---|---|
| `src/modules/feedback/service.ts` | System under test; imports `create`, `search`, `updateStatus`, `updateStatusById`, `remove` |
| `src/modules/feedback/repository.ts` | Used directly for `findByIdRaw` (honeypot non-persistence check) and `save` (seed / status pre-set) |
| `src/modules/feedback/audit.ts` | Imports `feedbackAuditActions` for audit-event assertions |
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` is fully mocked to capture and assert notification calls |
| `src/infrastructure/observability/audit.ts` | Partially mocked; `emitAuditEvent` spied, `recordAudit` wrapped (see Notes) |
| `src/types/index.ts` | `FeedbackRequestStatus` enum used throughout assertions |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the shared test DB before the suite |
| `tests/support/callers.ts` | `testCallerContext` supplies a valid caller identity for service calls |
| `tests/support/environment.ts` | `setEnvironment` swaps `NODE_CONTACT_NOTIFY_EMAIL`, `NODE_ANTIBOT_EMAIL_POLICY`, etc. per-test |
| `tests/support/ids.ts` | `MISSING_ID` for invalid/absent-ID rejection tests |
| `tests/support/ports.ts` | `observePort` helper; referenced in a comment explaining the audit-mock pattern (shared with `orders/tests/integration/cancel.test.ts`) |
| `tests/support/response.ts` | `asSuccess` / `asReject` unwrap `Result<T>` so tests can assert on `.data` or the error payload |

## Notes

- **Audit mock is intentionally complex.** `recordAudit` in the real module closes over its own `emitAuditEvent` binding, so a simple `jest.spyOn` on the exported `emitAuditEvent` would not intercept calls made through `recordAudit`. The mock therefore re-implements `recordAudit` to call a local spy via `buildAuditEvent`. This pattern is shared with `orders/tests/integration/cancel.test.ts` (see `tests/support/ports.ts` for the canonical reference).
- **`NODE_CONTACT_NOTIFY_EMAIL` is set in `beforeEach`, not in a global setup.** Service-level test suites never import `src/app.ts`, so `dotenv/config` never runs. Without this, honeypot "no notification" assertions would pass for the wrong reason (mailbox simply unset).
- **Honeypot whitespace edge case is explicitly tested.** A whitespace-only `website` value must be treated as empty (real clients leave the hidden field blank or with stray whitespace); only a non-whitespace value triggers spam disposition.
- **Disposable-email policy is opt-in.** `NODE_ANTIBOT_EMAIL_POLICY` defaults to off; a `mailinator.com` address must behave identically to a normal address unless the policy is explicitly enabled.
- **Spam dispositions return a 201-shaped result** (not a 4xx/5xx) so that a spam script cannot distinguish which anti-automation signal fired.
