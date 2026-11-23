---
source: src/modules/account/config.ts
source_sha256: 44b09ef1274dbc1e85295485785d81bd60c4cb55a9b066355ba19ac14209fdad
context_sha256: a928ac38c207a94928d651db94b786010d4b0852ec2bf7f9c2ff4442eff71128
generated_at: 2026-11-22T03:20:02.768943+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/config.ts

## Purpose
Declares the `account` module's environment-driven configuration and the helpers that turn it into usable values. It covers the frontend link templates for token-bearing confirmation emails, mail-link and export/ledger lifetimes, the account-deletion grace period, the Terms version, and the operator's legal identity. It exists so `account` owns its own link kinds, because `src/infrastructure/http/frontend-link.ts` only resolves a template into a URL and may not know modules by name.

## Key elements
- `AccountLinkKind`: union of six token-bearing link kinds: `verify`, `reset`, `setup`, `restore`, `email-change`, `email-undo`.
- `accountConfig`: the `defineConfig({ name: 'account', ... })` result. Its shape includes:
  - `NODE_FRONTEND_LINK_*` templates (verify, reset, setup, restore, email-change, email-undo, export, terms), each defaulting to `FRONTEND_LINK_RULES.links.*`.
  - `NODE_PASSWORD_RESET_TTL_MS` (default 1 hour), `NODE_EMAIL_VERIFY_TTL_MS` (default 1 day).
  - `NODE_INACTIVE_ACCOUNT_DAYS` (default 0), `NODE_INACTIVE_MINIMISE_DAYS` (default 1095).
  - `NODE_ACCOUNT_EXPORT_TTL_DAYS` (default 7).
  - `NODE_ACCOUNT_DELETION_GRACE_DAYS` (default 30, max 31).
  - `NODE_ERASURE_LEDGER_RETENTION_DAYS` (default 220).
  - `NODE_TERMS_VERSION` (default `'1'`).
  - `NODE_LEGAL_*` operator identity fields. Name, street, city, zip and country are required. VAT number, trade register, registration number, phone and email are optional.
- `LINK_ENV_VAR` (module-private): maps each `AccountLinkKind` to its env var name.
- `accountFrontendLink(kind, { locale, token })`: builds a frontend URL for one of the six kinds via `frontendLink`, passing the token.
- `accountExportLink(locale)`: link to the "export ready" page. It carries no token and is not an `AccountLinkKind`.
- `accountTermsLink(locale)`: link to the Terms page, for the setup mail.
- `deletionPurgeAt(requestedAt)`: returns the earlier of `requestedAt + grace days` and one calendar month later (UTC, via `oneCalendarMonthLaterUtc`).
- `exportRetentionMs()`: export retention in milliseconds.
- `erasureLedgerRetentionMs()`: erasure-ledger retention in milliseconds.

## Relationships
- `@infrastructure/config/define` and `@infrastructure/config/fields`: supply `defineConfig` and the field builders (`text`, `int`, `country`, `email`) used to declare the shape.
- `@infrastructure/http/frontend-link`: supplies `frontendLink`, which fills in the template, and `FRONTEND_LINK_RULES`, which provides the default templates.
- `@domain-primitives/time`: supplies `DAY_MS`, `HOUR_MS` and `oneCalendarMonthLaterUtc`.
- Other `account` files (emails, jobs, services such as account-deletion, erasure-ledger, export and password-reset-request, plus `module.ts`) are graph neighbors. They are presumably consumers of this config and its helpers. The file content does not show how each one uses it.

## Notes
- The token travels in the URL fragment (`#token=`), which browsers never send to servers. It therefore stays out of access logs, proxy logs and `Referer` headers.
- `deletionPurgeAt` applies two bounds because 30-31 days can overrun one calendar month when February is in the window (GDPR Art. 12(3)). The 31-day ceiling on the grace setting is enforced in code, not in the contract.
- The retention helpers read config at call time. A changed value applies to the next export built and the next reaper run.
- The erasure-ledger retention default (220 days) must outlast the oldest backup, or restoring that backup would resurrect an account the ledger has forgotten.
- `NODE_LEGAL_EMAIL` falls back to the support address (`NODE_SUPPORT_EMAIL`) when unset. `NODE_LEGAL_PHONE` is optional here, but the `shop` module's own check requires it.
