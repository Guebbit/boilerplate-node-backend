# src/modules/account/emails.ts

## Purpose

Contains every email-content builder for the account domain. Each exported function resolves i18n strings for a given locale and returns a fully-formed `EmailContent` object (template name, subject, render data) that can later be rendered by the mailer worker without needing a request context.

## Key elements

- **`accountLink`** (private) — Builds an absolute one-time URL from `NODE_URL` + route + token. Lives here (not in the template) so templates stay pure interpolators.
- **`verifyRequestEmail`** — Verification email with a one-time confirm link (`/account/verify/:token`).
- **`resetRequestEmail`** — Password-reset email with a one-time link (`/account/reset/:token`).
- **`setupRequestEmail`** — Sent when an admin creates a password-less account; reuses the same `reset` route and token shape as `resetRequestEmail`, differs only in copy.
- **`resetConfirmEmail`** — Post-change confirmation (no link).
- **`deleteRequestEmail`** — Account-deletion email with a one-time link (`/account/delete/:token`).
- **`deleteConfirmEmail`** — Post-deletion farewell (no link); includes an extra `farewell` field.
- **`inactivityWarningEmail`** — Grace-period warning sent by the reap script; interpolates `graceDays` into the body.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type; the mailer adapter later renders the returned template + data.
- **`src/infrastructure/i18n/index.ts`** — Imports `translator`; each builder calls `translator(locale)` to get a bound `t` function.
- **`src/modules/account/services/authentication.ts`** — Referenced by `setupRequestEmail`'s doc comment (`requestAccountSetup` shares the same token/TTL contract).
- **`src/modules/account/services/verification.ts`** — Upstream caller of `verifyRequestEmail`.
- **`scripts/reap-inactive-accounts.ts`** — Caller of `inactivityWarningEmail` (noted in its doc comment).
- **`src/modules/account/tests/unit/emails.test.ts`** — Unit tests for the builders in this file.
- **`tests/unit/i18n/email-locale.test.ts`** — Verifies locale resolution of the translation keys used here.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Renders the templates referenced by the `template` fields returned here.

## Notes

- **Templates never translate.** Because the mailer worker has no request or locale store, locale is an explicit first argument to every builder and `t` is bound up-front. The rendered template only interpolates the pre-resolved strings.
- **`setupRequestEmail` reuses the `reset` route.** It is not a distinct endpoint; the frontend treats it identically to a password reset.
- **Confirmation vs. request shape.** Request emails carry `linkUrl`, `linkLabel`, and `ignore`; confirmation emails (`resetConfirm`, `deleteConfirm`) carry only `body` (plus `farewell` for deletion). Adding a link to a confirmation email would require a new data shape.
- **`pageMetaLinks` is always `[]`** in the current code — reserved for future use (e.g., "view inbox" or "log out" links).
