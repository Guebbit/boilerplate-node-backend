---
source: tests/unit/infrastructure/adapters/email.worker.test.ts
sha256: 791b610b4f640d343f5867082e2379996047238fc601a9834d1ed40d26fd7854
generated_at: 2026-10-15T13:05:22.961087+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/email.worker.test.ts

## Purpose

Unit tests for `handleEmailJob`, the queue consumer that dispatches templated emails via SMTP. The file verifies the three-outcome contract (ack / permanent reject / requeue-on-failure), guards against malformed broker payloads reaching nodemailer, and pins the spooled-attachment lifecycle (discard on final outcomes, preserve on retryable failure). SMTP and PDF generation are mocked out; the test target is the *decision logic*, not delivery.

## Key elements

- **`handleEmailJob`** (imported from `email.worker.ts`) — the function under test. Accepts a job payload, validates it, calls the mailer, and returns `true` (ack), `false` (permanent reject), or throws (requeue).
- **`EMAIL_QUEUE` / `workerEmailQueue`** — identity assertion confirming the worker re-exports the same queue-name constant from `queue.ts`, preventing silent producer/consumer drift.
- **Mocked `sendTemplatedEmail`** (`mailer.ts`) — stubbed to control success/failure of the SMTP step.
- **Mocked `discardSpooled`** (`mail-spool`) — verifies attachment cleanup on final outcomes and absence on requeueable failures.
- **`logger.warn` / `logger.error`** spies — assert that refusals log only the template name (no payload leak) and that requeueable failures log the thrown error.
- **`it.each` malformed-payload suite** — six variants (empty `to`, missing `request`, missing `templateName`, empty object, `null`, `undefined`) all resolve `false` without invoking the mailer.

## Relationships

- **`src/infrastructure/adapters/email.worker.ts`** — module under test; source of `handleEmailJob` and the `EMAIL_QUEUE` re-export.
- **`src/infrastructure/adapters/queue.ts`** — provides the canonical `EMAIL_QUEUE` constant; the test imports it here to assert identity with the worker's re-export.
- **`src/infrastructure/adapters/mailer.ts`** — `sendTemplatedEmail` is the sole external side effect, fully mocked so tests isolate the worker's branching logic.
- **`src/infrastructure/adapters/logger.ts`** — spied on to verify the shape and scope of log output for refusals and failures.

## Notes

- The test imports `discardSpooled` from `@infrastructure/adapters/mail-spool`, a module **not** listed among the graph neighbors; it is an additional dependency of `email.worker.ts` that the test must mock independently.
- `jest.mock` calls use `require`-style factory mocks placed *before* the SUT import, relying on hoisting. The `discardSpooledMock` reference is hoisted via the `mockResolvedValue` pattern — keep that ordering if adding new spool interactions.
- The "defaults absent template data to `{}`" test encodes a contract with the mailer: `data` is never `undefined` at the call boundary.
- Attachment key is `key` (the spool handle), not `filename`; `discardSpooled` is called with the spool key.
