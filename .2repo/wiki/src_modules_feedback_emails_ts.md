# src/modules/feedback/emails.ts

## Purpose

Provides the resolved email copy for the feedback module's contact-request notification. It turns a `ContactRequest` payload and a locale string into a fully-translated `EmailContent` object that the mailer adapter can render. It exists so the sending worker never resolves language or assembles strings — it just ships what this file produces.

## Key elements

- **`ContactRequest`** (interface) — the shape of a feedback form submission: optional `name`, required `email`/`subject`/`message`, optional `createdAt`.
- **`contactRequestEmail(locale, feedback)`** — the sole export. Returns an `EmailContent` object with:
  - `template: 'feedback.contact'` — the handlebar/nunjucks template to render.
  - `subject` — a translated prefix concatenated with the customer's own subject line.
  - `data` — all label translations plus the raw customer fields (`email`, `subject`, `message`, `createdAt`). The `name` field falls back to a translated "not available" string when absent.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports the `EmailContent` type; the returned object is the contract the mailer adapter expects.
- **`src/infrastructure/i18n/index.ts`** — imports the `translator` factory to resolve every label string.
- **`src/modules/feedback/controllers/post-feedback-contact.ts`** — the caller that invokes `contactRequestEmail` with `NODE_DEFAULT_LOCALE` and the parsed form body.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — exercises the rendered output of the `feedback.contact` template against the data shape produced here.

## Notes

- The locale passed in is the **operator's** language (`NODE_DEFAULT_LOCALE`), not the customer's. The customer's free-text fields (`message`, `subject`) pass through untranslated by design.
- This template deliberately **omits the shared footer partial**. The builder returns exactly what the template prints — no post-processing is expected.
- The `name` fallback ("not available") is resolved in the builder, not in the markup, because a pure-interpolation template cannot branch between a value and a translated placeholder.
- Follows the same "language is an argument, output is finished text" rule as `src/modules/account/emails.ts`.
