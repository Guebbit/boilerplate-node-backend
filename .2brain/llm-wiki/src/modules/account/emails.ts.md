---
source: src/modules/account/emails.ts
sha256: f06644f0d92713df344cfa16114bfc0b7597a02b68c139da1c626870162db231
generated_at: 2026-10-15T09:56:47.343472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/emails.ts

## Purpose

Single home for every email the account module sends. Each exported builder takes an explicit `locale` string (no request or locale store exists at render time in the mailer worker), binds a translator to it, and returns a fully-resolved `EmailContent` — template name, subject, and interpolation data together. Templates only interpolate; all translation happens here at build time.

## Key elements

- **`greetableName(user, address)`** — Security guard: returns the account's `username` only when the destination address matches the account's *verified* email (compared via `normalizeEmail`). Prevents attacker-chosen display text from landing in a stranger's inbox.
- **`greetingFor(t, key, name)`** — Internal helper; picks the anonymous greeting when `name` is empty.
- **`accountMail({ template, locale, name, body })`** — Internal frame builder. Assembles subject, page-meta-title, greeting, footer, and the flow-specific `body(t)` slots under one `account.email.<flow>.*` key namespace. The `template` literal (e.g. `'account.verify-request'`) is the shared identifier consumed by the twin repository and cross-cutting sweeps.
- **`verifyRequestEmail(locale, name, token, kind?)`** — Confirmation link for signup verification or email-change confirmation.
- **`emailChangeNoticeEmail(locale, name, newEmail, undoToken)`** — Warning sent to the *old* address at change-request time (not completion), with a 7-day undo link.
- **`resetRequestEmail(locale, name, token)`** — One-time password-reset link.
- **`setupRequestEmail(locale, name, token)`** — Admin-created account setup; same token mechanics as reset, different copy.
- **`twoFactorCodeEmail(locale, name, code, minutes)`** — 2FA login code. Deliberately contains **no** `linkUrl` to avoid training recipients to click.
- **`reauthCodeEmail(locale, name, code, minutes)`** — Step-up reauth code (password-less re-proof of session).
- **`TwoFactorChange`** — Type: `'enrolled' | 'removed' | 'disabled'`.
- **`twoFactorChangedEmail(locale, name, change, method)`** — Out-of-band notice when a 2FA factor is added, replaced, removed, or 2FA is disabled. No acting link.
- **`twoFactorLockedEmail(locale, name, minutes)`** — One-time lock notice after too many wrong codes. No acting link.
- **`resetConfirmEmail(locale, name, providers?)`** — Post-reset confirmation; lists still-connected identity providers.
- *(truncated section likely covers export-complete, deletion, and reaping notices)*

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type that every builder returns; the mailer worker later renders it.
- **`src/infrastructure/i18n/index.ts`** (→ `catalog.ts`, `context.ts`) — Imports `translator` and `getDefaultLocale`; all copy keys (`account.email.<flow>.*`) resolve against the i18n catalog.
- **`src/infrastructure/persistence/normalize-email.ts`** — Imports `normalizeEmail` used in `greetableName` for case/format-insensitive address comparison.
- **`src/modules/account/config.ts`** — Imports `accountFrontendLink`, `accountExportLink`, and `AccountLinkKind` to build the URLs embedded in mail bodies.
- **`src/modules/account/services/password-reset-request.ts`** — Calls `resetRequestEmail` / `setupRequestEmail`.
- **`src/modules/account/services/password-reset.ts`** — Calls `resetConfirmEmail`.
- **`src/modules/account/services/email-change.ts`** — Calls `emailChangeNoticeEmail` and `verifyRequestEmail(kind='email-change')`.
- **`src/modules/account/services/reauth.ts`** — Calls `reauthCodeEmail`.
- **`src/modules/account/services/export.ts` / `export-job.ts`** — Call export-related email builders (truncated).
- **`src/modules/account/services/deletion-request.ts`** — Calls the deletion-confirmation builder (truncated).
- **`src/modules/account/services/reap-inactive.ts`** — Calls the inactivity-reaping builder (truncated).
- **`src/modules/account/index.ts`** — Module barrel; re-exports or references this file for external consumers.

## Notes

- **Locale is always an explicit parameter.** There is no ambient request context at render time (emails are dispatched by `adapters/email.worker.ts`); every builder must receive `locale` from its caller.
- **`greetableName` is the single security boundary** for printing a username. No template should bypass it. If you add a new mail, pass `name` through this function — never interpolate `user.username` directly.
- **`twoFactorCodeEmail` and `reauthCodeEmail` intentionally omit `linkUrl`.** Adding a link/button to these templates would teach recipients a click-reflex that phishing exploits.
- **The `template` string is load-bearing.** Cross-cutting sweeps (and the twin repository) read the literal `template:` lines as published identifiers. Do not compute or concatenate template names.
- **`body` is a callback `(t) => Record<string, unknown>`**, not a plain object — this defers interpolation to after the translator is bound, so every flow-specific slot sees the same locale-bound `t`.
