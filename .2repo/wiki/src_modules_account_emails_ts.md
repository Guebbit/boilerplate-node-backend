# src/modules/account/emails.ts

## Purpose

Contains every email-copy builder for the account module. Each builder resolves all translated strings, interpolated values, and links into a finished `EmailContent` object at call time, so the downstream email worker can render the template with nothing but the payload—no request, no locale store, no ambient state.

## Key elements

- **`accountLink`** *(private)* — Builds an absolute one-time-link URL (`/account/{route}/{token}`) from `NODE_URL`. Lives here so templates stay pure interpolation.
- **`registrationConfirmEmail`** — Welcome email after account creation.
- **`verifyRequestEmail`** — Email carrying the one-time verification link.
- **`resetRequestEmail`** — Email carrying the one-time password-reset link.
- **`resetConfirmEmail`** — Sent after the password has actually changed.
- **`deleteRequestEmail`** — Email carrying the one-time deletion-confirmation link.
- **`deleteConfirmEmail`** — Sent after the account row is removed; includes a farewell line.

Every public function takes `locale` as its first argument, binds a `translator` to it, and returns the full `EmailContent` (template name, subject, and a `data` object containing `locale`, `pageMetaTitle`, `pageMetaLinks`, body fields, and `footer`).

## Relationships

- **`@infrastructure/adapters/mailer`** — Source of the `EmailContent` type that every builder returns; the worker that later renders the named template.
- **`@infrastructure/i18n`** (`context.ts`, `index.ts`) — Provides the `translator(locale)` factory each builder calls to produce its scoped `t`.
- **Controllers** (`delete-account-request`, `delete-account-confirm`, `post-reset-request`, `post-reset-confirm`) and **`services/verification.ts`** — The callers that invoke the builders and pass the recipient's locale, name, and (where applicable) token.
- **Tests** (`email-locale.test.ts`, `mailer-templates.test.ts`) — Verify that every i18n key referenced in a builder exists and that the corresponding template file matches the `template` string.

## Notes

- Templates are interpolation-only (`<%= field %>`); they never call `t()` or read config. All resolution happens in these builders, which is why the file exists separately from the `.njk`/`.hbs` templates.
- The `locale` passed in is the **recipient's** language, not the requester's. Callers must look it up from the account record before calling the builder.
- `accountLink` reads `process.env.NODE_URL` at call time; there is no fallback beyond an empty string. If `NODE_URL` is unset, links will be relative.
- Template name and copy are paired in this file—add or rename a template and you must update the corresponding builder in the same change.
- `pageMetaLinks` is always `[]` in the current builders; it is part of the shared layout contract but unused here.
