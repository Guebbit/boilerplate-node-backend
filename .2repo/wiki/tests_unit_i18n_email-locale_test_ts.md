# tests/unit/i18n/email-locale.test.ts

## Purpose
Guards the "translate at the producer, render at the worker" email architecture: the enqueueing side must resolve all copy into a concrete language before the job hits the queue, and the worker must render whatever strings it is given regardless of any ambient locale context. Both halves are asserted with mocked SMTP and queue adapters.

## Key elements
- **`BODY`** — Pre-extracted English and Italian strings for the `registration-confirm` email, loaded from the account module's locale JSON files. Serves as the single source of truth for copy assertions.
- **`jobFor(locale)`** — Builds a queue-job object exactly as `enqueueEmail` would publish it (template + data from `registrationConfirmEmail`), with no locale attached.
- **`sentHtml()`** — Reads the rendered HTML from the first call to the mocked `sendMail`.
- **`describe('the producer resolves the copy before publishing')`** — Three tests verifying that the enqueued payload contains finished text (correct language, no `locale` key to resolve, `data.locale` is just the `<html lang>` string).
- **`describe('the email worker renders the copy it was given')`** — Five tests verifying that `handleEmailJob` sends the pre-resolved copy even under a deliberately wrong ambient locale, plus nack/ack contract (missing fields → `false`; SMTP failure → rejection for retry).
- **Mocks** — `nodemailer` (the repo's render-and-send wrapper, not the npm package) and `@infrastructure/adapters/queue` are both replaced with jest mocks before the dynamic imports.

## Relationships
- **`src/infrastructure/adapters/mailer.ts`** — Source of the `EmailRequest` type and the `enqueueEmail` function under test (imported dynamically to respect mock hoisting).
- **`src/infrastructure/i18n/index.ts`** — Exports `runWithLocale`, used to simulate an ambient locale store for both producer-side and worker-side tests.
- **`src/infrastructure/i18n/context.ts`** — Underlying AsyncLocalStorage context that `runWithLocale` binds to; the tests exercise the case where this store is absent or wrong.
- **`src/modules/account/emails.ts`** — Provides `registrationConfirmEmail`, the concrete email builder whose output (template + data) feeds both the enqueue and worker paths.

## Notes
- Dynamic `import()` is used for every SUT call (`enqueueEmail`, `handleEmailJob`) so that `jest.mock` hoisting is respected; a static import would bypass the mocks.
- `payload.data.locale` is **not** a runtime lookup key — it is a finished string (the `<html lang="…">` attribute). Tests assert it equals the literal locale code to prevent a future refactor from turning it into a resolution target.
- The nack contract mirrors `pdf.worker.ts`: `false` means "unprocessable, dead-letter"; a thrown rejection means "transient failure, retry." Confusing the two would either drop a valid email or spin a poison job forever.
- The file's block comment is the authoritative design rationale; the tests are secondary. If behavior changes, update the comment first.
