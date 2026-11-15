---
source: src/modules/account/emails.ts
sha256: 5bef5eb6ec3230148b09754a74ee0fddb0168bb57518fa6156f329f059030bb3
generated_at: 2026-11-14T18:35:56.498024+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/emails.ts

## Purpose

Every account-module email's finished content (template name, subject, localized body fields) is built here. Because emails render later in `adapters/email.worker.ts` with no request or locale store available, each builder binds its own translator to the recipient's locale up front and returns a complete `EmailContent` object. Templates only interpolate; they never translate.

## Key elements

- **`greetableName(user, address)`** – Security gate: returns the account's `username` only when the mail is going to that account's *verified* address; otherwise `''`. Prevents attacker-chosen display text from landing in a stranger's inbox.
- **`greetingFor(t, key, name)`** (internal) – Chooses a named greeting or a generic "Hello!" when no name is present.
- **`accountMail({template, locale, name, body, security})`** (internal) – Shared frame: derives the i18n key prefix from the template name, builds subject + `pageMetaTitle` + greeting + body slots + footer in one `EmailContent`. `security: true` switches the footer to the support-address variant.
- **`verifyRequestEmail(locale, name, token, kind?)`** – Confirmation-link email shared by signup verification and email-change flows (`kind` picks the frontend route).
- **`emailChangeNoticeEmail(locale, name, newEmail, undoToken)`** – Warning sent to the *old* address at change-request time; carries a 7-day undo link. Uses `security: true`.
- **`resetRequestEmail(locale, name, token)`** – One-time password-reset link.
- **`setupRequestEmail(locale, name, token)`** – Admin-created account's first contact; links Terms and privacy notice (GDPR Art. 14).
- **`twoFactorCodeEmail(locale, name, code, minutes)`** – 2FA login code. Deliberately contains **no link** (phishing-reflex prevention).
- **`reauthCodeEmail(locale, name, code, minutes)`** – Step-up code for passwordless sign-in; same layout as 2FA code but different template and copy.
- **`TwoFactorChange`** (exported type) – `'enrolled' | 'removed' | 'disabled' | 'codes-regenerated'`.
- **`twoFactorChangedEmail(locale, name, change, method)`** – Out-of-band MFA factor change notice (OWASP). No action link. Uses `security: true`.
- **`SignInMethodChange`** (exported type) – `'linked' | 'unlinked'`.
- **`signInMethodChangedEmail(...)`** – Out-of-band sign-in provider change notice (NIST SP 800-63C-4 §3.8). No action link.

## Relationships

- **`src/infrastructure/adapters/config.ts`** – Imports `supportEmail()` for the security-footer variant.
- **`src/infrastructure/adapters/mailer.ts`** – Imports the `EmailContent` return type shared by all builders.
- **`src/infrastructure/i18n/index.ts`** – Imports `translator` and `getDefaultLocale` to bind locale at build time.
- **`src/infrastructure/persistence/normalize-email.ts`** – Imports `normalizeEmail` used inside `greetableName` for case-insensitive address comparison.
- **`src/modules/account/config.ts`** – Imports `accountFrontendLink`, `accountTermsLink`, `accountExportLink`, and the `AccountLinkKind` type for constructing in-email URLs.
- **`src/modules/users`** (via `privacyFrontendLink`) – Used in `setupRequestEmail` for the GDPR privacy link.
- **`src/modules/account/index.ts`** – Re-exports the public builders so services can import them from the module barrel.
- **Service callers** (`email-change.ts`, `password-reset-request.ts`, `password-reset.ts`, `oauth.ts`, `account-deletion.ts`, `export.ts` / `export-job.ts`) – Each service calls the relevant builder(s) and passes the resulting `EmailContent` to the mailer adapter for queueing.

## Notes

- **Template names are identifiers, not i18n keys.** The `template` literal (e.g. `'account.reset-request'`) is a published outbox name shared with a twin repository; cross-cutting tooling sweeps the source text for `template:` lines. Do not rename or interpolate it.
- **`greetableName` is a one-line security rule.** Any new account email that prints the recipient's name must route through it; skipping it lets an unverified address carry attacker text.
- **No links in code-delivery emails.** `twoFactorCodeEmail` and `reauthCodeEmail` intentionally omit `linkUrl` so the recipient never forms a "click the button" habit.
- **`security: true` changes the footer.** When set, the footer names the support address from `supportEmail()` (env `NODE_SUPPORT_EMAIL`) instead of the generic `email.footer`.
- **The i18n key prefix is derived, not passed.** `accountMail` strips the `account.` prefix from the template name to build `account.email.<flow>.*` keys — add a new flow by adding a new template literal; the key namespace follows automatically.
