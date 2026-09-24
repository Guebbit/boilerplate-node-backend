---
source: src/modules/account/emails.ts
sha256: 39c5968537f2dca19819c3b7f8b3bbb842f98161b4762b45881ab2b7e64ca5a3
generated_at: 2026-09-23T18:05:00.605253+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/emails.ts

## Purpose

Pure builder functions for every outbound account-lifecycle email. Each function takes the recipient's locale, binds its own translator, and returns a complete `EmailContent` object (template ID, subject, and interpolated data). The file exists so that email copy is resolved eagerly at call time—before the async mailer worker picks up the job—because that worker has no request or locale store to translate against.

## Key elements

- **`verifyRequestEmail(locale, name, token, kind?)`** – Verification link email. Shared by both signup and email-change flows; the `kind` parameter (`'verify' | 'email-change'`) selects the frontend page the token lands on. Defaults to `'verify'`.
- **`emailChangeNoticeEmail(locale, name, newEmail)`** – Sent to the *old* address when a change is requested (not confirmed). Contains no token or actionable link—by design, so a "this wasn't me" response routes to password-reset / logout, not to a second confirmation.
- **`resetRequestEmail(locale, name, token)`** – Password-reset link email.
- **`setupRequestEmail(locale, name, token)`** – Admin-created account setup. Reuses the `'reset'` link kind and token type from `authentication.ts`; only the copy differs (recipient never had a password).
- **`twoFactorCodeEmail(locale, name, code, minutes)`** – Delivers a 6-digit login code. Deliberately contains **no link or button** to avoid training a click reflex that phishing pages exploit.
- **`resetConfirmEmail(locale, name)`** – Confirmation sent after the password actually changed.
- **`deleteRequestEmail(locale, name, token)`** – Account-deletion confirmation link.
- **`deleteConfirmEmail(locale, name)`** – Farewell, sent after the account row is removed.
- **`inactivityWarningEmail(locale, name, graceDays)`** – Stage-one inactivity notice; the second stage (erasure) is handled by the ops script.

## Relationships

- **`@infrastructure/adapters/mailer`** – Imports the `EmailContent` return type. The mailer worker later renders the returned template + data into a final message.
- **`@infrastructure/i18n`** – Imports `translator` to create a per-call, per-locale `t` function.
- **`@infrastructure/http/frontend-link`** – Imports `frontendLink` and `TokenLinkKind` to build absolute, locale-aware URLs for token-based links (`verify`, `email-change`, `reset`, `delete`).
- **`account/services/verification.ts`** – Calls `verifyRequestEmail` (both `kind` values).
- **`account/services/authentication.ts`** – Calls `resetRequestEmail`, `resetConfirmEmail`, and `setupRequestEmail`.
- **`account/services/profile.ts`** – Calls `emailChangeNoticeEmail`, `deleteRequestEmail`, `deleteConfirmEmail`.
- **`account/two-factor/methods/email.ts`** – Calls `twoFactorCodeEmail`.
- **`scripts/ops/reap-inactive-accounts.ts`** – Calls `inactivityWarningEmail` during its sweep.
- **Tests** – `account/tests/unit/emails.test.ts` (builder output), `tests/unit/infrastructure/adapters/mailer-templates.test.ts` (template/data shape), `tests/unit/i18n/email-locale.test.ts` (locale correctness).

## Notes

- **No translation happens here beyond interpolation.** The module docblock is explicit: templates only interpolate; actual rendering (including any layout-level translation) occurs later in the mailer worker.
- **`setupRequestEmail` and `resetRequestEmail` share the same `frontendLink('reset', …)` kind and token semantics.** Don't add a separate link kind unless the frontend page actually differs.
- **`twoFactorCodeEmail` must never gain a `linkUrl`.** The JSDoc flags this as a security decision, not a stylistic choice.
- **Every `data` object repeats `locale`, `pageMetaTitle`, and an empty `pageMetaLinks` array.** This is the contract the mailer worker / frontend expects for rendering the email as an HTML page—do not drop those fields when adding a new email.
