---
source: tests/unit/i18n/email-locale.test.ts
sha256: 66d200bb7fd5819afccebe7056fe4e8be15f165fa3c5b89ea4a16a05cf3a8e94
generated_at: 2026-09-23T20:15:53.385659+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/i18n/email-locale.test.ts

## Purpose

Guards the email i18n contract: the producer must fully resolve translated copy before a job hits the queue, and the downstream worker must render whatever copy it receives without consulting any ambient locale store. The tests also cover the worker's nack/retry semantics for malformed jobs and SMTP failures.

## Key elements

- **`sendMailMock` / `publishToQueueMock`** — Jest spies injected via `jest.mock('nodemailer')` and `jest.mock('@infrastructure/adapters/queue')`; they let tests inspect the exact HTML/subject handed to SMTP and the exact payload published to the queue.
- **`BODY`** — Object holding the English and Italian `reset-confirm` body strings pulled directly from the locale JSON files, used as the assertion target throughout.
- **`jobFor(locale)`** — Builds a queue payload exactly as `enqueueEmail` would publish it (template + data + request), simulating the producer's output.
- **`sentHtml()`** — Convenience accessor for the HTML argument passed to the mocked `sendMail`.
- **`describe('the producer resolves the copy before publishing')`** — Three cases asserting that the published payload carries finished Italian/English strings, contains no `locale` field for the worker to resolve, and ignores any ambient `runWithLocale` scope.
- **`describe('the email worker renders the copy it was given')`** — Four cases asserting the worker sends the correct language regardless of ambient locale, nacks (returns `false`) for jobs missing a recipient or template, and rejects (rather than nacks) on SMTP failure so the queue retries.

## Relationships

- **`src/infrastructure/i18n/context.ts`** — Source of `runWithLocale`, imported via the barrel. The test uses it to create a deliberately *wrong* ambient locale and proves the worker/producer ignore it.
- **`src/infrastructure/i18n/index.ts`** — Barrel re-export; the test imports `runWithLocale` from this path.
- **`src/modules/account/emails.ts`** — Provides `resetConfirmEmail`, the email builder under test. The test calls it to generate content, then feeds that content into the mocked queue/worker pipeline.
- **`src/types/index.ts`** — Supplies the `EmailJobPayload` type used to type the `REQUEST` constant and the queue-payload assertions.

## Notes

- Both `enqueueEmail` and `handleEmailJob` are loaded via **dynamic `await import(...)`** inside each test. This is intentional: it ensures the mocked queue/nodemailer modules are already in place before the real factory functions capture their dependencies, avoiding import-order races.
- `payload.data.locale` is asserted to be a **plain string** (`'it'`) used only as the `<html lang>` attribute in the template — it is *not* a key the worker looks up. The test explicitly documents this to prevent a future developer from "fixing" the worker to re-resolve it.
- The "rejects" SMTP-failure case relies on `mockRejectedValueOnce`, so it only affects the next call; other tests in the same block still see the default `mockResolvedValue({ messageId: 'test' })`.
- The test mocks `nodemailer` (this repo's local render-and-send wrapper at `src/infrastructure/adapters/...`), **not** the third-party `nodemailer` package. The assertion target is the rendered HTML, not SMTP wire behavior.
