---
source: tests/unit/i18n/email-locale.test.ts
sha256: 1cdd15c6e4a57040f736b51b8430869aca816041a51484a831fb9ddac9494128
generated_at: 2026-11-08T10:05:02.372944+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/i18n/email-locale.test.ts

## Purpose
Guards the i18n contract for transactional email: the producer (`enqueueEmail`) must fully resolve all copy into the requested locale *before* the job hits the queue, and the worker (`handleEmailJob`) must render whatever text it is given regardless of any ambient locale context. The tests pin down both halves of that boundary so neither side silently re-introduces a runtime lookup.

## Key elements
- **`sendMailMock`** – `jest.fn()` injected via a `nodemailer` factory mock; captures the HTML/subject the transport would send.
- **`publishToQueueMock` / `isQueueEnabledMock`** – factory-mock the queue adapter so `enqueueEmail` publishes to a spy instead of a real broker.
- **`BODY`** – `{ en, it }` pair of the `reset-confirm` email body pulled directly from the locale JSON files; the single string asserted throughout.
- **`jobFor(locale)`** – calls `resetConfirmEmail(locale, 'Ada')` and shapes the result into the exact job object the queue would deliver, with no extra locale field.
- **`sentHtml()`** – convenience accessor for the first `sendMail` call's `html` property.
- **`describe('the producer resolves the copy before publishing')`** – three tests verifying the queue payload contains finished Italian text, no top-level `locale` key, and that an ambient `runWithLocale('en')` wrapper does not override the explicit argument.
- **`describe('the email worker renders the copy it was given')`** – five tests: correct language rendering, ambient-locale independence, two nack cases (missing `request` / missing `templateName` resolve to `false`), and one retry case (SMTP rejection propagates as a thrown error).

## Relationships
- **`src/infrastructure/i18n/context.ts`** → provides `runWithLocale`, imported via the `@infrastructure/i18n` barrel; used to *set* an ambient locale that the tests assert is irrelevant to the worker.
- **`src/infrastructure/i18n/index.ts`** → barrel re-export source for `runWithLocale` (the `@infrastructure/i18n` specifier).
- **`src/modules/account/emails.ts`** → exports `resetConfirmEmail`, the email-builder under test; also the origin of the `enAccount` / `itAccount` locale JSON files used for assertions.
- **`src/types/index.ts`** → source of the `EmailJobPayload` type that shapes the `REQUEST` constant and the payload type-casts.

## Notes
- All production modules (`mailer`, `email.worker`, `resetConfirmEmail`) are loaded via `await import()` inside each test so that the `nodemailer` and queue factory mocks (declared with `jest.mock`) are in effect before any module-level side effects run.
- SMTP is mocked at the **`nodemailer` package boundary**, not at the repo's `sendTemplatedEmail` wrapper — the assertion target is the rendered HTML and subject, i.e. the final copy, not an internal API.
- `payload.data.locale` is asserted to be the literal string `'it'` (used by the template for `<html lang="it">`), *not* a key for a later dictionary lookup. This distinction is the crux of the design the tests protect.
- The retry-vs-nack contract is tested explicitly: a structurally invalid job resolves to `false` (dead-letter), while an SMTP-level failure rejects (re-queue). Conflating the two would either drop sendable mail or redeliver unprocessable jobs forever.
