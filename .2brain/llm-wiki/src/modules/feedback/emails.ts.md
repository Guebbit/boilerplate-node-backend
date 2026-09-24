---
source: src/modules/feedback/emails.ts
sha256: 9186f17d9b20221c01fd77fd2ed91f4f594e2cd1b561cab51da5f03d81bd6c1d
generated_at: 2026-09-23T18:39:47.190420+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/emails.ts

## Purpose

Builds the finished email content (subject + rendered data object) for the feedback module's operator notification. Follows the same convention as `@modules/account/emails`: the caller passes a locale, the function returns a ready-to-send `EmailContent`. Emails go to the support mailbox, so they are rendered in `NODE_DEFAULT_LOCALE` and the customer's own submitted text is passed through untranslated.

## Key elements

- **`ContactRequest`** (interface) — shape of the contact-form payload: `name?`, `email`, `subject`, `message`, `createdAt?`.
- **`contactRequestEmail(locale, feedback)`** — the sole export function. Calls `translator(locale)` to resolve every label/heading, then returns an `EmailContent` with template `'feedback.contact'` and a `data` object containing the translated labels plus the raw user values.

## Relationships

- **`@infrastructure/adapters/mailer`** — provides the `EmailContent` type that `contactRequestEmail` returns.
- **`@infrastructure/i18n`** (index / context) — provides the `translator` factory used to resolve all string keys.
- **`src/modules/feedback/service.ts`** — upstream caller that invokes `contactRequestEmail` and hands the result to the mailer.
- **`src/modules/feedback/index.ts`** — module barrel; re-exports or routes requests to this file.
- **`src/modules/feedback/tests/unit/emails.test.ts`** — unit tests covering `contactRequestEmail` output.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — renders the `feedback.contact` template against the data produced here.

## Notes

- The `name` field falls back to a _translated_ "not available" string in JS (`feedback.name || t('…not-available')`) rather than relying on a template-level default, because a purely interpolating template cannot choose between a value and a placeholder.
- The shared `footer` partial is intentionally skipped; this email is internal-facing.
- The email subject is composed as `translated-prefix: user-subject` so an operator can triage without opening the mail.
