# src/modules/feedback/emails.ts

## Purpose

Defines the operator-facing email copy for new contact-form submissions in the feedback module. It resolves i18n strings into a fully-rendered `EmailContent` object that the mailer adapter can dispatch to the support mailbox. Language is an argument; the output is finished text.

## Key elements

- **`ContactRequest`** (exported interface) — the shape of a contact-form submission: optional `name` and `createdAt`, required `email`, `subject`, `message`.
- **`contactRequestEmail(locale, feedback)`** (exported function) — returns an `EmailContent` targeting the `feedback.contact` template. Composes the subject as a translated prefix followed by the ticket's own subject. Populates template `data` with translated labels and the raw customer values. Falls back to a translated "not available" placeholder when `name` is missing (handled here, not in markup).

## Relationships

- **`@infrastructure/i18n`** (`index.ts` / `context.ts`) — imports `translator` to obtain a locale-bound translation function.
- **`@infrastructure/adapters/mailer`** — imports the `EmailContent` type used as the return type; the returned object is what the mailer adapter serialises and sends.
- **`src/modules/feedback/service.ts`** — the upstream service that calls `contactRequestEmail` when a new contact request is created.
- **`src/modules/feedback/tests/unit/emails.test.ts`** — unit tests exercising `contactRequestEmail` output shape and translations.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — tests the `feedback.contact` template markup that consumes the `data` payload produced here.

## Notes

- This email is **operator-facing** (goes to the support inbox) and renders in `NODE_DEFAULT_LOCALE`, not the customer's locale. The `locale` argument is still passed for label translation.
- The customer's `subject` and `message` are inserted verbatim — they are **not** translated.
- The template skips the shared `footer` partial (unlike customer-facing emails).
- The `name` fallback lives in the JS layer, not the template, because a pure-interpolation template cannot choose between a value and a translated placeholder.
- Follows the same convention as `@modules/account/emails`: language in, finished text out.
