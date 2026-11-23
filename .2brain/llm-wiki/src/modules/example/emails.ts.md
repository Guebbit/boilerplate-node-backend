---
source: src/modules/example/emails.ts
generated_at: 2026-11-22T05:08:43.888584+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/emails.ts

## Purpose
Builds the content of the mail an owner receives when their example is published. It turns translation keys into finished strings for a given locale, so the template renderer later has nothing left to resolve. The module doc marks it as deletable if the module sends no mail (together with `src/modules/orders/services/notify.ts` and `templates/`).

## Key elements
- `examplePublishedEmail(locale, name, title): EmailContent` is the only export. It creates a translator with `translator(locale)` and returns:
  - `template: 'example.published'`
  - `subject`: the `example.email-published.subject` key, interpolated with `title`
  - `data`: `locale`, `pageMetaTitle` (same text as the subject), `greeting` (key `example.email-published.greeting`, with `name`), `body` (key `example.email-published.body`, with `title`), and `footer` (key `email.footer`)

## Relationships
- `src/infrastructure/adapters/mailer.ts`: provides the `EmailContent` type this function returns.
- `src/infrastructure/i18n/index.ts`: provides `translator`, which does all the string lookup.
- `src/infrastructure/i18n/context.ts`: no import in this file; it is a graph neighbor and is presumably related through the i18n layer.
- `src/modules/orders/services/notify.ts`: per the module doc, it belongs to the same mail-sending group as this file.
- `src/modules/example/index.ts`: a graph neighbor of this file.
- `src/modules/example/tests/unit/emails.test.ts` and `tests/unit/infrastructure/adapters/mailer-templates.test.ts`: tests related to this file. The latter concerns mailer templates.

## Notes
- The function is pure text output: the locale is an argument and no template-side translation is expected.
- `subject` and `pageMetaTitle` are produced by two separate identical `t(...)` calls.
