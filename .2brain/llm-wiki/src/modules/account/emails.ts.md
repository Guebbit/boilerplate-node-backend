---
source: src/modules/account/emails.ts
sha256: 5b5d3f51483e561612896a77ae573894964470c86ab0ceb27d090fac77a69770
generated_at: 2026-10-29T02:34:10.045207+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/emails.ts

## Purpose

Defines the finished email content (template name, subject, and rendered body data) for every account-flow email the application sends. Templates here only interpolate; actual translation is deferred to the mailer worker, which has no request context. Each builder binds its own locale-bound translator and returns a complete `EmailContent` object ready for the outbox.

## Key elements

- **`accountMail`** (internal) — Shared frame builder. Derives copy keys from a `account.<flow>` template name, assembles subject, page title, greeting, flow-specific body slots, and a security-aware footer (support address or generic). Returns `EmailContent`.
- **`greetingFor`** (internal) — Picks between a named greeting and an anonymous "Hello!" based on whether a display name is present.
- **`greetableName`** (export) — Security gate: returns the account's `username` only when the mail is going to that account's own verified address; otherwise returns `''` to prevent injecting attacker-chosen text into a stranger's inbox.
- **`verifyRequestEmail`** (export) — Verification / email-change confirmation link email. Parameterised by `kind` (`'verify'` | `'email-change'`) to target the correct frontend page.
- **`emailChangeNoticeEmail`** (export) — Sent to the **old** address when a change is requested. Carries a 7-day undo link. Flags `security: true`.
- **`resetRequestEmail`** (export) — Password-reset link email.
- **`setupRequestEmail`** (export) — Admin-initiated "set your first password" email; same link/token mechanics as reset, different copy.
- **`twoFactorCodeEmail`** (export) — Delivers a 6-digit 2FA code in plain text. Deliberately contains **no** link to avoid training the recipient to click.
- **`reauthCodeEmail`** (export) — Step-up re-authentication code for password-less accounts. Same layout as the 2FA code, distinct template and copy.
- **`TwoFactorChange`** (export type) — Union: `'enrolled' | 'removed' | 'disabled' | 'codes-regenerated'`.
- **`twoFactorChangedEmail`** (export) — Out-of-band notice of an MFA factor change. No actionable link. Flags `security: true`.
- **`SignInMethodChange`** (export type) — Union: `'linked' | 'unlinked'`.
- **`signInMethodChangedEmail`** (export) — Notice when an OAuth provider is linked or unlinked. No actionable link.

## Relationships

- **`@infrastructure/adapters/mailer`** — Imports the `EmailContent` return type every builder produces.
- **`@infrastructure/i18n`** (`context.ts`, `catalog.ts`, `index.ts`) — Imports `translator` and `getDefaultLocale`; all copy keys resolve through the i18n catalog at call time.
- **`@infrastructure/persistence/normalize-email`** — `normalizeEmail` is used by `greetableName` to compare addresses case-insensitively.
- **`./config`** (`src/modules/account/config.ts`) — Imports `accountConfig` (support email), `accountFrontendLink` (URL builders), and `AccountLinkKind`.
- **`./index.ts`** — Re-exports the public email builders so sibling services can import from the module barrel.
- **`./services/email-change.ts`** — Caller of `emailChangeNoticeEmail` and (via `verifyRequestEmail` with `kind: 'email-change'`) the confirm-link email.
- **`./services/password-reset-request.ts`** — Caller of `resetRequestEmail` and `setupRequestEmail`.
- **`./services/oauth.ts`** — Caller of `signInMethodChangedEmail`.
- **`./services/account-deletion.ts`** — Likely caller of `greetableName` and/or a deletion-notice builder (truncated portion).
- **`./services/export.ts` / `export-job.ts`** — Consume `accountExportLink` from config for export-related mail (indirect via the same config module).

## Notes

- The `template` field in `accountMail` is typed as `` `account.${string}` `` and marked `readonly` deliberately: cross-cutting sweeps parse the literal `template:` lines from source to catalogue published outbox names. Do not refactor to a variable.
- `greetableName` is the single enforcement point for "may we print this name?" — every caller must route the name through it rather than passing `user.username` directly.
- `twoFactorCodeEmail` and `reauthCodeEmail` intentionally omit `linkUrl`; adding one would undermine the anti-phishing design noted in their doc comments.
- The file was truncated in the provided content; `signInMethodChangedEmail` and possibly a few additional builders (e.g., deletion notice, export completion) are cut off. Treat the export list above as partial if the full file contains more builders after the truncation point.
