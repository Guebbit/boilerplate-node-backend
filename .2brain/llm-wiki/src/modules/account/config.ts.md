---
source: src/modules/account/config.ts
sha256: 4b1c38b70470549ccfe62b6c6dd7df9964273792fb2fc22dbb2ebe0e789cd8d9
generated_at: 2026-11-08T04:00:11.830002+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/config.ts

## Purpose

Defines the `account` module's runtime configuration (frontend link templates, token TTLs, export/ledger retention, deletion grace, legal-identity fields) and provides small helper functions that resolve those values into concrete URLs or timestamps. It is the single source of truth for every tunable the account module needs, keeping infrastructure generic while encoding account-specific semantics here.

## Key elements

- **`AccountLinkKind`** — union of five token-bearing link kinds: `verify`, `reset`, `restore`, `email-change`, `email-undo`.
- **`accountConfig`** — the `defineConfig` object exposing all `NODE_*` env-var fields (link templates, TTLs, retention days, legal identity, terms version). Each field has a type-constrained default and optional min/max.
- **`LINK_ENV_VAR`** — internal map from each `AccountLinkKind` to its env-var name; used by `accountFrontendLink`.
- **`accountFrontendLink(kind, { locale, token })`** — resolves a token-bearing frontend URL via `frontendLink`; the token is placed in the URL fragment.
- **`accountExportLink(locale)`** — resolves the signed-in export-download page URL (no token).
- **`deletionPurgeAt(requestedAt)`** — returns the earlier of `requestedAt + grace days` and `requestedAt + 1 calendar month` (GDPR Art. 12(3) ceiling).
- **`exportRetentionMs()`** — export TTL in milliseconds (read at call time).
- **`erasureLedgerRetentionMs()`** — erasure-ledger row retention in milliseconds; must outlast the oldest backup snapshot.

## Relationships

- **`@infrastructure/config/define`** (`defineConfig`) and **`@infrastructure/config/fields`** (`text`, `int`, `email`, `country`) — provide the config-building API and field-type constructors.
- **`@infrastructure/http/frontend-link`** (`frontendLink`, `FRONTEND_LINK_RULES`) — `frontendLink` turns a template string + params into a URL; `FRONTEND_LINK_RULES` supplies the default route templates. This file owns *which* kinds exist; frontend-link is kind-agnostic.
- **`@domain-primitives/time`** (`DAY_MS`, `HOUR_MS`, `oneCalendarMonthLaterUtc`) — time-unit constants for TTL defaults and the calendar-month cap in `deletionPurgeAt`.
- **`src/modules/account/emails.ts`**, **`services/password-reset-request.ts`** — consume `accountFrontendLink` to build the confirmation/reset URLs placed in outbound mail.
- **`services/account-deletion.ts`** — calls `deletionPurgeAt` to compute the erasure deadline.
- **`services/export.ts` / `export-job.ts` / `export-rows.ts`** — call `exportRetentionMs` and `accountExportLink`.
- **`services/erasure-ledger.ts`** — calls `erasureLedgerRetentionMs` to decide when to prune ledger rows.
- **`services/operator-identity.ts`** — reads the `NODE_LEGAL_*` fields to render the operator's legal notice.
- **`consent-record.ts`** — reads `NODE_TERMS_VERSION` for consent versioning.
- **`jobs.ts`** — reads retention values to schedule reaper/cleanup passes.
- **`module.ts`** — registers/exposes this config as part of the account module's public surface.

## Notes

- Tokens ride in the URL **fragment** (`#token=…`), not the path or query. Browsers never transmit fragments to servers (RFC 3986 §3.5), so they appear in no access log, proxy log, or `Referer` header.
- The module-level doc comment says "four token-bearing kinds" but `AccountLinkKind` and `LINK_ENV_VAR` actually define **five** (`email-undo` was added later). The type-level JSDoc correctly says five.
- `NODE_ACCOUNT_DELETION_GRACE_DAYS` has a code-level `max: 31`, but the comment explicitly notes nothing on the wire is bounded by it; the real ceiling is the one-calendar-month cap applied inside `deletionPurgeAt`.
- `NODE_ERASURE_LEDGER_RETENTION_DAYS` (default 220) is chosen to outlast the 6-monthly-snapshot backup window (~7 months) so restoring an old snapshot cannot resurrect an account the ledger has already forgotten.
- `NODE_INACTIVE_MINIMISE_DAYS` defaults to 1095 (3 years) and `NODE_INACTIVE_ACCOUNT_DAYS` to 0 (disabled) — both gate inactivity-based account minimisation, not deletion.
