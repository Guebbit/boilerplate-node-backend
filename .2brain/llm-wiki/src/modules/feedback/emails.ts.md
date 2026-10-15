---
source: src/modules/feedback/emails.ts
sha256: a7f8f1af205f9cf58447bb6e247ed2bf3bd3a91dabec2d1cc353b96e5984d246
generated_at: 2026-10-15T10:32:02.613842+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/emails.ts

## Purpose

Resolves all outgoing email copy for the feedback module into finished, interpolated strings. Follows the same convention as `@modules/account/emails`: language is passed in as an argument, output is a complete `EmailContent` object ready for the mailer. Because these emails go to the **support mailbox** (not the customer), they render in `NODE_DEFAULT_LOCALE` and the customer's own input is never re-translated.

## Key elements

- **`ContactRequest` (interface)** — The shape of data the contact form collects: optional `name`, required `email`/`subject`/`message`, and an optional `createdAt` timestamp.
- **`contactRequestEmail(locale, feedback)` (function)** — Builds the operator-facing notification email for a new contact request. Returns an `EmailContent` with template `feedback.contact`, a composed subject (translated prefix + the ticket's own subject), and a `data` object carrying all label strings and field values for the template.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type; this file's return value is the contract the mailer adapter consumes.
- **`src/infrastructure/i18n/index.ts`** — Imports the `translator` factory used to resolve every string.
- **`src/modules/feedback/service.ts`** — Upstream caller that invokes `contactRequestEmail` when a contact request is created.
- **`src/modules/feedback/index.ts`** — Barrel file that re-exports the public API of this module.
- **`src/modules/feedback/tests/unit/emails.test.ts`** — Unit tests covering the output shape and translated strings.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Renders the `feedback.contact` template against this file's `data` payload.

## Notes

- **Locale is fixed to the operator's, not the sender's.** The `locale` parameter is always `NODE_DEFAULT_LOCALE` in practice; the customer's words (`name`, `email`, `subject`, `message`) pass through untranslated.
- **No shared `footer` partial.** Unlike customer-facing emails, this template intentionally omits it.
- **`name` fallback lives in the data object**, not the template. `feedback.name || t('…not-available')` gives the template a single code path — it only interpolates.
- **Subject composition:** the translated prefix and the ticket's own subject are joined with a colon so operators can triage without opening the email.
- See `docs/tools/email-and-rendering.md` for the broader rendering rules referenced in the module docblock.
