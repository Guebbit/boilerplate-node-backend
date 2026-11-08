---
source: tests/unit/infrastructure/adapters/email.worker.test.ts
sha256: 791b610b4f640d343f5867082e2379996047238fc601a9834d1ed40d26fd7854
generated_at: 2026-11-08T10:06:13.743785+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/email.worker.test.ts

## Purpose

Unit tests for `handleEmailJob`, the email queue consumer. The file verifies the worker's three-outcome contract (ack, permanent reject, requeue) and its attachment-discarding side effects, while all external I/O (SMTP, spool, logging) is mocked. The decision logic under test is: which payloads are permanently invalid vs. which failures are transient and should be redelivered.

## Key elements

- **`handleEmailJob`** (imported from `email.worker.ts`) — the function under test; returns `true` (ack), `false` (dead-letter), or throws (requeue).
- **Queue-identity test** (`'re-exports the email queue unchanged'`) — asserts `workerEmailQueue === EMAIL_QUEUE` by reference, catching producer/consumer name drift.
- **Ack path** — confirms the mailer is called with the job's fields forwarded verbatim (`data` is not re-resolved) and `true` is returned.
- **Default-data guard** — absent `templateName` data defaults to `{}`, not `undefined`.
- **Invalid-payload table** (`it.each`) — six shapes (empty recipient, missing request, missing template, empty job, `null`, `undefined`) all resolve `false`, never call the mailer, and log a `warn` containing only the template name.
- **Requeue path** — a rejected `sendTemplatedEmail` propagates the rejection (not a `false`), and the error is logged via `logger.error`.
- **Attachment-discarding suite** (`describe('discarding the spooled attachment')`) — pins the three outcomes: discard on success, discard on permanent reject, *do not* discard on transient failure (retry needs the file).

## Relationships

- **`src/infrastructure/adapters/email.worker.ts`** — the system under test; imports `handleEmailJob` and the re-exported `EMAIL_QUEUE`.
- **`src/infrastructure/adapters/queue.ts`** — source of the canonical `EMAIL_QUEUE` constant used to verify the worker's re-export is referentially identical.
- **`src/infrastructure/adapters/mailer.ts`** — mocked at module level (`sendTemplatedEmail`); the test never performs real SMTP.
- **`src/infrastructure/adapters/logger.ts`** — spied on in `beforeEach` to assert `warn`/`error` call shapes without polluting output.

## Notes

- The test explicitly does **not** test PDF generation; that lives in `pdf.test.ts`.
- `mail-spool` (`discardSpooled`) is mocked via a factory returning a shared `discardSpooledMock`, because it is not listed in the graph neighbors but is part of the worker's attachment lifecycle.
- The requeue-vs-dead-letter distinction is the file's central concern: `false` means "this job can never work," a thrown error means "the world is temporarily wrong." Conflating the two (e.g., returning `false` on an SMTP timeout) would silently lose emails.
- Log assertions check that refused jobs expose only `templateName` in the warning, not the full payload (which may contain user data).
