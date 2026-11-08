---
source: src/modules/tasks/emails.ts
sha256: 8ae14ac3cdb3c33d709466605c67a35b2b679fc2c90cf3d341874ecef26a77ce
generated_at: 2026-11-08T08:33:58.559838+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/emails.ts

## Purpose

Defines the fully-resolved email content (subject, plain-text body, HTML template data) for the two operator-facing notifications the tasks module sends: new contact requests (and their reminders) and erasure notices. All i18n strings are resolved to finished text at call time — language is an argument, output is plain strings. Emails go to the main mailbox (`NODE_SUPPORT_EMAIL`) and render in `NODE_DEFAULT_LOCALE`; customer-supplied text is passed through untranslated, and the shared `footer` partial is skipped.

## Key elements

- **`ContactRequest`** — interface describing the fields the contact form collects (id, name, email, subject, message, category, orderNumber, createdAt) plus an optional `reminder` discriminator.
- **`ContactReminder`** — union type `'overdue' | 'due-soon'`; selects which reminder suffix is appended to i18n keys.
- **`taskRef(id)`** — returns the last 8 characters of a task id, used as the `[#ref]` token in subjects and body text so mailbox threads map back to a task.
- **`contactRequestEmail(locale, contact)`** — builds an `EmailContent & { text: string }` for a new contact request or a reminder. Includes a `[privacy]` tag in the subject when `category === 'privacy'`, a staff-page deep link, and a plain-text `text` part alongside the HTML template data.
- **`erasureNoticeEmail(locale, ids)`** — builds an `EmailContent` that lists only the `[#ref]` tokens of deleted tasks (no PII) so mailbox copies can be located and purged.

## Relationships

- **`@infrastructure/adapters/mailer`** — imports the `EmailContent` type that both email functions return; the mailer adapter consumes those objects to send.
- **`@infrastructure/i18n`** — imports `translator` to resolve all keys into finished strings per the given `locale`.
- **`@infrastructure/http/frontend-link`** — uses `FRONTEND_LINK_RULES.staffPages.task` and `frontendLink()` to produce the deep link placed in the contact-request email.
- **`src/modules/tasks/service.ts`** — caller that invokes these functions and hands the result to the mailer.
- **`src/modules/tasks/index.ts`** — barrel re-export surface for the module.
- **`src/modules/tasks/tests/unit/emails.test.ts`** — unit tests for the exported functions.
- **`src/modules/tasks/tests/integration/erasure-notice.test.ts`** — integration test exercising `erasureNoticeEmail`.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — tests the HTML templates (`tasks.contact`, `tasks.erasure-notice`) that these functions reference.

## Notes

- Customer-supplied fields (`name`, `email`, `subject`, `message`) are inserted verbatim into both the text body and the template `data`; they are **not** passed through the translator.
- The `name` fallback (`"Not available"`) is resolved in the `data` object, not in the template markup — a template that only interpolates cannot choose between a value and a translated placeholder.
- `taskRef` is the last 8 characters, not the full id; both the subject line and the staff-page link use the full id for matching, but the visible reference is truncated.
- The erasure notice intentionally contains **no** address, name, or message text — only `[#ref]` tokens — to avoid retaining PII in operator mailboxes.
