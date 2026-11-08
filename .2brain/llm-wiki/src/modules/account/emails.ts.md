---
source: src/modules/account/emails.ts
sha256: 1f7bb8b06c789cc58c3c421fc44fbcc99d0f015181b2e270f99579559b7eed53
generated_at: 2026-11-08T04:09:44.024649+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/emails.ts

## Purpose

Single source of every account-module email's finished copy. Each exported builder resolves i18n strings into a complete `EmailContent` (template name, subject, render data) for a given locale. Templates only interpolate; all translation happens here at build time because the downstream mail worker has no request or locale store to resolve against.

## Key elements

- **`greetableName(user, address)`** — Returns the user's display name only if the mail is addressed to their *verified* email; otherwise `''`. Prevents attacker-chosen names from appearing in a stranger's inbox.
- **`greetingFor(t, key, name)`** (internal) — Picks between a named greeting and the anonymous fallback.
- **`accountMail({template, locale, name, body, security?})`** (internal) — Shared frame: assembles subject, `pageMetaTitle`, greeting, flow-specific body slots, and footer into an `EmailContent`. When `security` is true, the footer names the support address.
- **`verifyRequestEmail(locale, name, token, kind?)`** — One-time confirmation link; shared by signup re-send (`'verify'`) and email-change (`'email-change'`).
- **`emailChangeNoticeEmail(locale, name, newEmail, undoToken)`** — Warning to the *old* address at request time; carries a 7-day undo link. Sets `security: true`.
- **`resetRequestEmail(locale, name, token)`** — Password-reset link email.
- **`setupRequestEmail(locale, name, token)`** — Admin-created account; user sets first password. Same link shape as reset, different copy.
- **`twoFactorCodeEmail(locale, name, code, minutes)`** — Six-digit 2FA login code. Deliberately contains **no link or button**.
- **`reauthCodeEmail(locale, name, code, minutes)`** — Step-up code for passwordless re-authentication.
- **`TwoFactorChange`** (type) — `'enrolled' | 'removed' | 'disabled' | 'codes-regenerated'`.
- **`twoFactorChangedEmail(locale, name, change, method)`** — Out-of-band MFA change notice. No actionable link. Sets `security: true`.
- **`SignInMethodChange`** (type) — `'linked' | 'unlinked'`.
- **`signInMethodChangedEmail(locale, name, change, provider)`** — Out-of-band provider link/unlink notice. No actionable link.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type that every builder returns.
- **`src/infrastructure/i18n/index.ts`** (re-exports from `catalog.ts` / `context.ts`) — Imports `translator` and `getDefaultLocale`; each builder binds its own `t` to the recipient's locale.
- **`src/infrastructure/adapters/config.ts`** — Imports `supportEmail` for the security footer.
- **`src/infrastructure/persistence/normalize-email.ts`** — Imports `normalizeEmail` so `greetableName` can compare addresses case-insensitively.
- **`src/modules/account/config.ts`** — Imports `accountFrontendLink`, `accountExportLink`, and `AccountLinkKind` to build the frontend URLs embedded in each email.
- **`src/modules/account/services/email-change.ts`** — Caller of `emailChangeNoticeEmail` and `verifyRequestEmail(kind='email-change')`.
- **`src/modules/account/services/password-reset-request.ts`** — Caller of `resetRequestEmail` and `setupRequestEmail`.
- **`src/modules/account/services/oauth.ts`** — Caller of `signInMethodChangedEmail`.
- **`src/modules/account/index.ts`** — Module barrel; re-exports the public builders for other modules to import.

## Notes

- **Template names are load-bearing literals.** Each `template: 'account.<flow>'` string is read by cross-cutting sweeps as a published outbox identifier. The `readonly` annotation on the parameter type is intentional so that type-level tools don't mistake it for a value.
- **No links in 2FA/step-up code emails.** A mail that carries a code *and* a button trains the recipient to click, which is the reflex a phishing page exploits. The recipient types the code into the tab they already opened.
- **Locale is always an explicit argument.** There is no request context in the mail worker; the calling service must pass the recipient's locale into every builder.
- **`security: true`** switches the footer to include the support address (`NODE_SUPPORT_EMAIL`). Used by `emailChangeNoticeEmail`, `twoFactorChangedEmail`, and `signInMethodChangedEmail` — i.e., any email that signals a security-relevant change.
