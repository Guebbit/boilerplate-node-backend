---
source: tests/unit/infrastructure/adapters/email.worker.test.ts
sha256: fbfc8f49af2e8803060b0261deb88497032ae3d5cae63bf6bf52b8e730f2e725
generated_at: 2026-09-23T20:16:55.386425+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/email.worker.test.ts

## Purpose

Unit tests for `handleEmailJob`, the email queue consumer. The SMTP side-effect is fully mocked so the tests exercise only the **decision logic**: which payloads are refused (→ `false`, dead-lettered), which failures are allowed to reject (→ requeued), and whether spooled attachments are discarded or preserved accordingly.

## Key elements

- **`handleEmailJob`** (imported from `email.worker.ts`) — the function under test; returns `true` (ack), `false` (nack-no-requeue), or throws (nack-with-requeue).
- **`mockedMailer`** — `nodemailer` from the mailer adapter, mocked via `jest.mock`; every test asserts on its call args or rejection rather than real SMTP.
- **`discardSpooledMock`** — `discardSpooled` from `mail-spool`, mocked to verify whether a spooled PDF attachment is cleaned up or left for retry.
- **Queue identity test** — asserts `workerEmailQueue === EMAIL_QUEUE`, pinning that the worker's re-export is literally the same token the registry uses.
- **`it.each` refusal table** — six malformed payloads (empty `to`, missing `request`, missing `templateName`, empty object, `null`, `undefined`) that must all resolve `false` without touching the mailer.
- **Spool-discard describe block** — three cases: discard on success, discard on permanent refusal, _do not_ discard on transient failure.

## Relationships

- **`src/infrastructure/adapters/email.worker.ts`** — system under test; supplies `handleEmailJob` and the re-exported `EMAIL_QUEUE`.
- **`src/infrastructure/adapters/mailer.ts`** — `nodemailer` is mocked so no real SMTP call occurs; tests assert on its call signature.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` and `logger.error` are spied on to confirm the worker logs refusals and failures.
- **`src/infrastructure/adapters/queue.ts`** — source of the canonical `EMAIL_QUEUE` constant; the identity test ensures producer and consumer cannot drift.

## Notes

- The critical invariant being guarded is the **false-vs-throw** boundary: `false` permanently dead-letters the email, a throw requeues it. A test that accidentally asserts `rejects` where it should assert `resolves.toBe(false)` (or vice versa) would silently change retry semantics.
- `data` is forwarded to the mailer **untouched**; the producer resolves template variables before publishing, so the worker must not re-resolve.
- The mail-spool module is mocked but is **not** a graph neighbor of this test file in the dependency graph — it is a transitive dependency of `email.worker.ts` that the test intercepts to observe discard calls.
