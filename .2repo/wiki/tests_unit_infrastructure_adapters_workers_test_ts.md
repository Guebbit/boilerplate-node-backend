# tests/unit/infrastructure/adapters/workers.test.ts

## Purpose

Unit tests for the two queue workers (`handleEmailJob` and `handlePdfJob`), focusing exclusively on their **decision logic**: which malformed payloads are refused (resolve `false` → dead-letter) versus which infrastructure failures are allowed to propagate (reject → broker requeues). All side effects (nodemailer, puppeteer, ejs) are mocked; the tests never exercise actual delivery or rendering.

## Key elements

- **`describe('the queue names')`** — Asserts that `email.worker` and `pdf.worker` re-export queue-name constants that are *identical* (`toBe`) to the originals in `queue.ts`, and that the two names are distinct from each other.
- **`describe('handleEmailJob')`** — Verifies: valid job acks (`resolves true`) and forwards `data` untouched to `nodemailer`; absent `data` defaults to `{}`; six malformed shapes (empty `to`, missing `request`, missing `templateName`, empty object, `null`, `undefined`) all resolve `false` without calling the mailer; an SMTP rejection propagates as a thrown error (not `false`).
- **`describe('handlePdfJob')`** — Verifies: valid job renders via `ejs.renderFile` then `renderHtmlToPdf` and acks; five malformed shapes resolve `false` without rendering; a template-render failure rejects before the PDF step; a PDF-render failure (puppeteer crash) rejects after a successful template render.
- **Mocks** — `nodemailer`, `renderHtmlToPdf`, and `ejs.renderFile` are module-level `jest.mock` stubs. `logger.warn/error/info` are spied per-test in `beforeEach`.
- **`beforeEach` / `afterAll`** — Clears all mocks, spies on the three logger methods, and restores all spies after the suite.

## Relationships

- **`src/infrastructure/adapters/email.worker.ts`** — Imports `handleEmailJob` and `EMAIL_QUEUE`; the primary test subject.
- **`src/infrastructure/adapters/pdf.worker.ts`** — Imports `handlePdfJob` and `PDF_QUEUE`; the second test subject.
- **`src/infrastructure/adapters/queue.ts`** — Source of the canonical `EMAIL_QUEUE` / `PDF_QUEUE` constants used in identity assertions.
- **`src/infrastructure/adapters/mailer.ts`** — Mocked; provides the `nodemailer` function stub.
- **`src/infrastructure/adapters/pdf.ts`** — Mocked; provides the `renderHtmlToPdf` function stub.
- **`src/infrastructure/adapters/logger.ts`** — Imported for spy assertions on `warn` (refused jobs) and `error` (requeue-worthy failures).

## Notes

- The **three-outcome contract** (ack / permanent-nack / requeue-nack) is the entire testing focus. The boundary between "this payload will never be valid" and "the infrastructure is temporarily unhealthy" is what these tests guard.
- Queue-name assertions use `toBe` (identity), not `toEqual`—the intent is to catch a re-export that silently resolves to a different string.
- Malformed-payload cases use `it.each` with `null` and `undefined` job bodies, reflecting that the broker can deliver a null message body, not just a partial object.
- Template `data` is asserted to be forwarded **as-is** to the mailer/PDF chain; the worker does not re-resolve or re-interpret locale fields.
- Failure-path tests assert both the rejection/throw **and** the corresponding `logger.error` call with the error message, ensuring visibility of repeatedly requeued jobs.
