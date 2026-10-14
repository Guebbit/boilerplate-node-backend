---
source: src/modules/account/emails.ts
sha256: 5efd6b2a81ef7cfe018acf34d07b6b24c9550c6ca924a3529c1b6b3655ae2f3b
generated_at: 2026-10-14T08:39:55.045622+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/emails.ts

## Purpose

Central registry of every email the account module sends. Each exported builder resolves i18n strings (via an explicit `locale` argument) into a complete `EmailContent` object—template name, subject, and render context—that the mail worker later sends. Templates here only interpolate; they never translate, because the rendering step (`adapters/email.worker.ts`) has no request or locale store to read from.

## Key elements

- **`greetableName`** (exported) – Security gate: returns the account's `username` *only* when the destination address matches the account's verified email; otherwise returns `''`. Prevents placing attacker-chosen display text in a stranger's inbox.
- **`greetingFor`** (private) – Chooses between the named greeting key and the shared `greeting-anonymous` key based on whether a name was supplied.
- **`verifyRequestEmail`** – Builds the verification / email-change confirmation email (parameterised by `kind: 'verify' | 'email-change'`).
- **`emailChangeNoticeEmail`** – Warning to the *old* address at the moment a change is requested; carries the 7-day undo link.
- **`resetRequestEmail`** – Password-reset link email.
- **`setupRequestEmail`** – Same link/token as reset, but copy reflects "you never had a password."
- **`twoFactorCodeEmail`** – Delivers the 6-digit code in the body. Deliberately contains **no link**, so the recipient types the code rather than clicking.
- **`reauthCodeEmail`** – Step-up (re-authentication) code; same no-link layout as the 2FA code email.
- **`TwoFactorChange`** (type) – `'enrolled' | 'removed' | 'disabled'`.
- **`twoFactorChangedEmail`** – Out-of-band notice that a 2FA factor was added, removed, or 2FA disabled. No actionable link.
- **`twoFactorLockedEmail`** – One-shot warning when repeated wrong codes lock 2FA checks. No actionable link.
- *(File is truncated; additional builders—e.g. reset confirmation, export, deletion notices—likely follow.)*

## Relationships

- **`@infrastructure/adapters/mailer`** – Supplies the `EmailContent` return type that every builder produces.
- **`@infrastructure/i18n`** (`index`, `catalog`, `context`) – Provides `translator(locale)` and `getDefaultLocale`; all strings here are resolved through these.
- **`./config`** – `accountFrontendLink` builds the absolute URLs embedded in each email; `AccountLinkKind` constrains the `kind` parameter of `verifyRequestEmail`.
- **`@infrastructure/persistence/normalize-email`** – Used by `greetableName` to compare addresses case/format-insensitively.
- **Service callers** – `email-change.ts`, `password-reset-request.ts`, `password-reset.ts`, `reauth.ts`, `export.ts` / `export-job.ts`, `deletion-request.ts` each import the relevant builder(s) to obtain their `EmailContent`.
- **`src/modules/account/index.ts`** – Re-exports this module (and/or its siblings) at the package boundary.
- **`scripts/ops/reap-inactive-accounts.ts`** – Ops script that presumably triggers an inactivity-warning email through a builder in this file.

## Notes

- **Locale is always an explicit parameter.** There is no ambient request context at render time; every builder takes `locale: string` as its first argument and binds `translator(locale)` locally.
- **No link in code-delivery emails.** `twoFactorCodeEmail` and `reauthCodeEmail` intentionally omit `linkUrl` to avoid training the recipient to click, which is the exact reflex a phishing page exploits.
- **`greetableName` is the single choke-point** for the "may I print this name?" decision. Every template that greets by name calls `greetingFor`, which in turn relies on the caller having passed the result of `greetableName`. Adding a new name-bearing email without going through this path is a security bug.
- **`emailChangeNoticeEmail` fires at request time, not completion.** The doc comment is explicit: a warning that arrives after the takeover is a receipt, not a warning.
- **Template names are stable identifiers** (e.g. `'account.two-factor-code'`) used by the mail worker and outbox; they are not interchangeable even when two emails share a layout.
