---
source: src/modules/tickets/emails.ts
sha256: 40a796fefc91a189988c57ec8999ee3f543920942a033ce2d098be45938d34ff
generated_at: 2026-10-29T06:03:17.609374+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/emails.ts

## Purpose

Contains the fully-resolved email copy for the tickets module (operator-facing notifications). Follows the same convention as `@modules/account/emails`: language is a function argument and the return value is finished, translated text ready for the mailer. Emails land in the fallback mailbox (rendered in `NODE_DEFAULT_LOCALE`), skip the shared `footer` partial, and leave customer-supplied fields (subject, message) untranslated.

## Key elements

- **`ContactRequest`** (interface) — Shape of the contact-form payload plus the `createdAt` timestamp stamped at creation.
- **`contactRequestEmail(locale, contact)`** (exported const) — Builds an `EmailContent` object for the `tickets.contact` template: composes the subject (translated prefix + the ticket's own subject), translates all labels/meta, and passes customer fields through verbatim.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type that `contactRequestEmail` returns.
- **`src/infrastructure/i18n/index.ts`** — Imports `translator`, used to resolve every label, title, and fallback string at call time.
- **`src/modules/tickets/service.ts`** — The business-logic layer that calls `contactRequestEmail` when a new contact request is persisted.
- **`src/modules/tickets/index.ts`** — Module barrel; re-exports this file's symbols.
- **`src/modules/tickets/tests/unit/emails.test.ts`** — Unit tests for `contactRequestEmail` output shape and translation lookups.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Verifies the `tickets.contact` template the function targets renders correctly with the data this file supplies.

## Notes

- The `name` and `category` fields use `||` / `??` fallbacks to a *translated* "not available" string **in the data object**, not in the template. A purely interpolating template cannot branch between a value and a translated placeholder, so the decision must happen here.
- `contact.subject` and `contact.message` are intentionally passed through untouched — they are the customer's own words and must not be translated.
- The subject line is `translated-prefix + ": " + contact.subject`, so an operator can see the topic without opening the email.
