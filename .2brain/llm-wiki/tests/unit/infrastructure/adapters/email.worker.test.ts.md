---
source: tests/unit/infrastructure/adapters/email.worker.test.ts
sha256: 71cd76f5cb275c53fbb8c2463360bca1faa6d56f88511edeb20cdedeef646213
generated_at: 2026-09-27T16:03:16.000883+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/email.worker.test.ts

## Purpose

Unit test for `handleEmailJob` in `email.worker.ts`. It verifies the worker's **decision logic** — which payloads are permanently refused (resolve `false`), which failures are allowed to escape as rejections (broker requeue), and which succeed (resolve `true`) — without exercising real SMTP delivery. PDF generation is explicitly out of scope and covered in `orders/tests/unit/invoice.test.ts`.

## Key elements

- **`it('re-exports the email queue unchanged')`** — asserts `workerEmailQueue === EMAIL_QUEUE` (identity, not value), guarding against a silent queue-name drift between producer and consumer.
- **`describe('handleEmailJob')`** — the main block, containing:
  - Happy-path send: asserts `sendTemplatedEmail` is called with the job's `data` forwarded verbatim (not re-resolved in worker's locale).
  - Default `data` to `{}` when the field is absent (rather than `undefined`).
  - `it.each` over six malformed/null payloads: each must resolve `false`, never call the mailer, and emit `logger.warn`.
  - SMTP-failure case: the worker must **reject** (not resolve `false`), and log via `logger.error` with the original error object.
- **`describe('discarding the spooled attachment')`** — pins three spool-lifecycle rules:
  - Success → `discardSpooled(key)` called once.
  - Permanent refusal (e.g. empty recipient) → `discardSpooled(key)` called.
  - Transient failure (SMTP reject) → `discardSpooled` **not** called, so a retry can still resolve the attachment.
- **Mocks** — `mailer.sendTemplatedEmail`, `mail-spool.discardSpooled`, and `logger.warn`/`logger.error` are all jest-mocked; no network or filesystem I/O occurs.

## Relationships

- **`src/infrastructure/adapters/email.worker.ts`** — the unit under test. The file imports `handleEmailJob` and the re-exported `EMAIL_QUEUE` constant.
- **`src/infrastructure/adapters/queue.ts`** — imported solely for `EMAIL_QUEUE` so the re-export identity assertion compares against the canonical spelling.
- **`src/infrastructure/adapters/mailer.ts`** — `sendTemplatedEmail` is the sole side-effect dependency; fully mocked at module level.
- **`src/infrastructure/adapters/logger.ts`** — spied on (`warn`, `error`) to assert the worker logs refusals and failures without asserting message text.

## Notes

- The `beforeEach` resets all mocks **and** re-sets `discardSpooledMock` to resolve `undefined`, since `jest.clearAllMocks()` alone would wipe the `mockResolvedValue`.
- The worker's three-outcome contract (true / false / throw) is the central invariant. The test suite is structured to make the **false-vs-throw** boundary explicit: a refused payload is a *fact about the message*; a thrown error is a *fact about the infrastructure*.
- The mail-spool mock is set up with `jest.mock` at module scope (hoisted) rather than inline, because `discardSpooled` is imported inside the worker, not directly here.
- `null` and `undefined` jobs are included in the malformed-payload table because a broker can deliver a null body; the worker's `job?.` guard is what makes those safe.
