---
source: src/modules/account/emails.ts
sha256: ccae3a4e5fb4a9686947f91ffab9e8e465ecd1a2e54f6bab50bbbfabe2ea1212
generated_at: 2026-09-27T14:27:08.164174+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/emails.ts

## Purpose

Central registry of every account-module email's copy. Each exported builder receives an explicit locale string and returns a fully-resolved `EmailContent` (template id, translated subject, and render-context data) ready for the mailer adapter. Because emails are rendered later in a worker with no request or locale store, translation is bound here at build time to the *recipient's* language rather than inherited from a caller context.

## Key elements

- **`verifyRequestEmail(locale, name, token, kind?)`** – Confirmation-link email shared by signup, re-send, and email-change flows. `kind` (`'verify'` | `'email-change'`) only selects the frontend page the token lands on; the copy is intentionally neutral about which address it confirms.
- **`emailChangeNoticeEmail(locale, name, newEmail)`** – Warning sent to the *old* address the moment a change is requested. No token, no actionable link by design.
- **`resetRequestEmail(locale, name, token)`** – Password-reset link email.
- **`setupRequestEmail(locale, name, token)`** – Same link and token semantics as `resetRequestEmail` (both use `'reset'` link kind); differs only in copy (the user never had a password).
- **`twoFactorCodeEmail(locale, name, code, minutes)`** – Delivers the 6-digit 2FA code in the clear. Deliberately contains **no** link or button to avoid training the recipient to click, which a phishing page would exploit.
- **`resetConfirmEmail(locale, name)`** – Sent after the password has actually changed.
- **`deleteRequestEmail(locale, name, token)`** – Deletion confirmation link.
- **`deleteConfirmEmail(locale, name)`** – Farewell sent after the account row is removed.
- **`inactivityWarningEmail(locale, name, graceDays)`** – Grace-period warning consumed by the reaper script.
- **`recipientLocale(locale, context?)`** – Resolves the language to use: account's own locale → caller-context locale → `getDefaultLocale()`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** – Imports the `EmailContent` type; every builder's return value is shaped to that contract.
- **`src/infrastructure/i18n/index.ts` (→ `catalog.ts`, `context.ts`)** – Imports `translator` and `getDefaultLocale`; each builder calls `translator(locale)` to bind all strings.
- **`src/modules/account/config.ts`** – Imports `accountFrontendLink` and `AccountLinkKind` to construct the `linkUrl` value in link-bearing emails.
- **`src/types/index.ts` / `src/types/auth-context.ts`** – Imports `CallerContext` as the optional fallback parameter of `recipientLocale`.
- **`src/modules/account/services/verification.ts`** – Primary consumer of `verifyRequestEmail`.
- **`src/modules/account/services/authentication.ts`** – Consumes `resetRequestEmail` and `setupRequestEmail` (the latter via `requestAccountSetup`).
- **`src/modules/account/services/profile.ts`** – Consumes `emailChangeNoticeEmail`, `deleteRequestEmail`, `deleteConfirmEmail`.
- **`src/modules/account/two-factor/methods/email.ts`** – Consumes `twoFactorCodeEmail`.
- **`scripts/ops/reap-inactive-accounts.ts`** – Consumes `inactivityWarningEmail`.
- **`src/modules/account/index.ts`** – Re-exports the builders for external import.
- **`src/modules/account/tests/unit/emails.test.ts`** – Unit tests for the builders.
- **`tests/unit/i18n/email-locale.test.ts`** – Exercises locale-resolution paths, including `recipientLocale`.

## Notes

- **Templates interpolate, they don't translate.** The `template` field is an id; all human-readable strings are pre-translated into `data`/`subject` by the builder. The worker (`adapters/email.worker.ts`) only fills in the already-resolved strings.
- **`setupRequestEmail` and `resetRequestEmail` share the same frontend link** (`accountFrontendLink('reset', …)`). If you change one link's behavior, change both.
- **`twoFactorCodeEmail` has no `linkUrl`.** This is intentional and load-bearing; adding a button would undermine the anti-phishing rationale.
- **`emailChangeNoticeEmail` is a one-way warning.** It carries no token and no link. The "undo" path is the existing password-change / logout-everywhere flow, not anything in this email.
- **`data` always includes `locale`, `pageMetaTitle`, and `pageMetaLinks`.** These are consumed by the shared email renderer for page framing, not shown as body copy.
- **Locale resolution order in `recipientLocale`:** account's stored locale → caller context → server default. Emails sent outside a request (e.g. admin-created setup) have no caller context, so the third branch matters.
