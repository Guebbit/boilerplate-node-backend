# tests/unit/i18n/email-locale.test.ts

## Purpose

Guards the split-responsibility contract for localized email: the **producer** must fully resolve all copy (subject, body, footer, `<html lang>` value) before a job is published to the queue, and the **worker** must render only what it was handed without ever consulting a locale store. The tests assert both halves against the `reset-confirm` account email in English and Italian.

## Key elements

- **`BODY`** – Pre-extracted `reset-confirm` body strings for `en` and `it`, pulled from the locale JSON files. Used as the single ground-truth string asserted throughout.
- **`jobFor(locale)`** – Calls `resetConfirmEmail(locale, 'Ada')` and wraps the result in the exact shape `enqueueEmail` would publish (`{ request, templateName, data }`). Simulates the queue job without going through the queue.
- **`sentHtml()`** – Reads the first argument of the mocked `nodemailer` `sendMail` call and returns its `html` property.
- **`describe('the producer resolves the copy before publishing')`** – Three tests confirming the queued payload contains finished Italian strings, carries no `locale` key for the worker to look up, and is unaffected by an ambient `runWithLocale('en')` scope.
- **`describe('the email worker renders the copy it was given')`** – Five tests confirming the worker sends the correct language regardless of ambient locale, rejects malformed jobs (missing recipient or template) with `false`, and propagates SMTP failures as rejections (so the queue retries rather than dead-letters).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** – Source of `enqueueEmail`, the producer under test. The tests verify the payload it publishes to the queue.
- **`src/infrastructure/i18n/index.ts`** / **`src/infrastructure/i18n/context.ts`** – Provide `runWithLocale`, used in several tests to establish a deliberately *wrong* ambient locale and prove the code under test ignores it.
- **`src/modules/account/emails.ts`** – Provides `resetConfirmEmail`, the email builder whose output (template name + data) is the subject of every assertion.
- **`src/infrastructure/adapters/email.worker.ts`** (imported dynamically in tests) – The worker under test on the consumer side; not a static graph neighbor but a test target.

## Notes

- All modules under test (`mailer`, `email.worker`) are imported via dynamic `await import(…)` inside tests to ensure the `jest.mock` hoisting for `nodemailer` and `queue` takes effect first.
- `nodemailer` here is the repo's own render-and-send wrapper (not the npm package); the mock targets `createTransport().sendMail`.
- The `data.locale` field in the payload is **not** a lookup key for the worker — it is a finished string the template prints as `<html lang="…">`. Tests explicitly assert it equals `'it'` or `'en'` as a literal, not as a resolvable token.
- Nack semantics are pinned: missing recipient/template → resolves `false` (dead-letter); SMTP rejection → throws (requeue). This mirrors the contract documented on `pdf.worker.ts`.
