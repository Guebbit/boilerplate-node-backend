---
source: tests/unit/i18n/email-locale.test.ts
sha256: e233344ededb2e9fdd074bbf0887fbc6efecc204a0356498e8ab5f1f4c71a132
generated_at: 2026-09-27T16:02:27.031771+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/i18n/email-locale.test.ts

## Purpose

Guards the i18n contract for transactional emails: the producer must resolve all copy into finished strings *before* the job hits the queue, and the worker must render whatever it is handed without consulting any locale context. Every test here exists to prevent a regression where a locale key or lookup sneaks across the queue boundary.

## Key elements

- **`sendMailMock` + `nodemailer` mock** — intercepts SMTP at the `createTransport` level so assertions can inspect the final rendered HTML and subject.
- **`publishToQueueMock` / `isQueueEnabledMock`** — mock the queue adapter to capture the exact payload the producer publishes.
- **`jobFor(locale)`** — builds a queue job by calling `resetConfirmEmail` directly, simulating the shape `enqueueEmail` would publish.
- **`sentHtml()`** — pulls the HTML string from the `nodemailer` mock's first call.
- **`describe('the producer resolves the copy before publishing')`** — three tests: payload carries resolved Italian/English copy; payload has no `locale` property (only `data.locale` as a literal `<html lang>` string); ambient `runWithLocale` scope does not override the explicit argument.
- **`describe('the email worker renders the copy it was given')`** — five tests: worker renders the given copy correctly in `en` and `it`; worker ignores an ambient locale that contradicts the payload; missing `request` or `templateName` → resolves `false` (nack); SMTP rejection → throws (retry, not dead-letter).

## Relationships

- **`src/infrastructure/i18n/index.ts`** — barrel that re-exports `runWithLocale`; imported to wrap test bodies in a deliberately wrong ambient locale.
- **`src/infrastructure/i18n/context.ts`** — the underlying ALS-based `runWithLocale` implementation exercised by the "ignores ambient locale" cases.
- **`src/modules/account/emails.ts`** — source of `resetConfirmEmail`, the producer function under test, and the `en.json` / `it.json` locale files whose strings are asserted against.
- **`src/types/index.ts`** — provides the `EmailJobPayload` type used to type the test fixtures and the queue-payload assertions.

## Notes

- Mocks are set up *before* the SUT import, but the SUT modules (`mailer`, `email.worker`) are loaded via dynamic `import()` inside each test to ensure the module-level mocks are already in place.
- The assertion target is the rendered HTML / subject (the "copy"), not an internal `sendTemplatedEmail` call. This is intentional: the contract is about what arrives at the SMTP layer.
- `data.locale` in the payload is a literal string (e.g. `"it"`) used as the `<html lang>` attribute — it is *not* a lookup key and the worker never resolves it.
- The nack-vs-reject split (resolve `false` for unprocessable jobs vs. throw for transient SMTP errors) mirrors the convention shared by every queue worker in this codebase.
