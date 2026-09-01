# src/modules/account/emails.ts

## Purpose

Defines the copy and payload for every account-lifecycle email (verification, password reset, account setup, deletion). Each exported builder resolves all strings into finished text via the i18n translator at call time and returns a complete `EmailContent` object, so the downstream mailer worker only needs to interpolate a static template with no request context, locale store, or environment access.

## Key elements

- **`accountLink(route, token)`** *(private)* — Builds an absolute one-time URL from `process.env.NODE_URL`. Lives here rather than in a template because templates must stay pure interpolation and cannot reach for configuration.
- **`verifyRequestEmail(locale, name, token)`** — Verification email carrying a `/account/verify/{token}` link.
- **`resetRequestEmail(locale, name, token)`** — Password-reset request carrying a `/account/reset/{token}` link.
- **`setupRequestEmail(locale, name, token)`** — Sent when an admin creates an account with no password; reuses the same `/account/reset/{token}` route as reset but with distinct copy (recipient never had a password).
- **`resetConfirmEmail(locale, name)`** — Post-change confirmation; no link, just a short body.
- **`deleteRequestEmail(locale, name, token)`** — Deletion request carrying a `/account/delete/{token}` link.
- **`deleteConfirmEmail(locale, name)`** — Sent after the row is deleted; includes a `farewell` field in addition to the standard `body`.

All builders share the same shape: call `translator(locale)` to get a bound `t`, then return `{ template, subject, data }` where `data` includes `locale`, `pageMetaTitle`, `pageMetaLinks`, greeting/intro/link fields (or body), and `footer`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Provides the `EmailContent` type that every builder returns. The mailer adapter (and its worker) consumes these objects to render the named template.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Exports the `translator` factory used here to bind a locale-specific `t` function.
- **`src/modules/account/services/verification.ts`** — Calls `verifyRequestEmail` when a user requests or resends their verification link.
- **`src/modules/account/services/authentication.ts`** — Calls `resetRequestEmail`, `setupRequestEmail`, and `resetConfirmEmail` from its `requestPasswordReset` and `requestAccountSetup` flows.
- **`src/modules/account/services/profile.ts`** — Calls `deleteRequestEmail` and `deleteConfirmEmail` during the account-deletion flow.
- **`src/modules/account/tests/unit/emails.test.ts`** — Unit-tests the builders directly.
- **`tests/unit/i18n/email-locale.test.ts`** — Verifies that the translation keys used here resolve correctly across locales.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Confirms the named templates (e.g. `account.verify-request`) expect exactly the `data` fields these builders provide.

## Notes

- Templates in this project are **interpolation-only**: they must never call `t()` or read `process.env`. All translation and config access is pushed into these builders so the rendering worker stays stateless.
- `setupRequestEmail` reuses the `reset` route path (`/account/reset/{token}`) — the server-side handler distinguishes the two flows via the token type stored in the DB, not the URL.
- `process.env.NODE_URL` may be empty/undefined (falls back to `''`), producing a relative URL. This is intentional for local/dev use but means the link is broken in production if the env var is unset.
- The `pageMetaLinks` array is always `[]` in these emails; it exists on the type for HTML-email client rendering but is unused in account emails.
