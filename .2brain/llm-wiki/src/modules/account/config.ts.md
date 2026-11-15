---
source: src/modules/account/config.ts
sha256: 02a85a9ea9fd30c7fcd61b6593f0a029b11beeb19b787a1c9afe90fa280f771b
generated_at: 2026-11-14T18:30:03.847045+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/config.ts

## Purpose

Central configuration surface for the `account` module: declares every tunable (frontend link templates, token TTLs, export/grace periods, legal-identity fields) in one `defineConfig` block, and exposes small pure helpers that resolve a link or a duration from the resolved config so callers never touch `process.env` directly.

## Key elements

- **`AccountLinkKind`** (type) — union of the six token-bearing link kinds: `'verify' | 'reset' | 'setup' | 'restore' | 'email-change' | 'email-undo'`.
- **`accountConfig`** — the `defineConfig` instance. Fields include eight `NODE_FRONTEND_LINK_*` templates, `NODE_PASSWORD_RESET_TTL_MS`, `NODE_EMAIL_VERIFY_TTL_MS`, `NODE_INACTIVE_ACCOUNT_DAYS`, `NODE_INACTIVE_MINIMISE_DAYS`, `NODE_ACCOUNT_EXPORT_TTL_DAYS`, `NODE_ACCOUNT_DELETION_GRACE_DAYS` (max 31), `NODE_ERASURE_LEDGER_RETENTION_DAYS`, `NODE_TERMS_VERSION`, and the full `NODE_LEGAL_*` block (name, street, city, zip, country are required).
- **`LINK_ENV_VAR`** (internal const) — maps each `AccountLinkKind` to its env-var name; used to index into the resolved config at call time.
- **`accountFrontendLink(kind, { locale, token })`** — resolves the template for `kind`, then delegates to `frontendLink`, injecting the token into the URL fragment.
- **`accountExportLink(locale)`** — builds the "your export is ready" link; carries no token (the download route requires a fresh session).
- **`accountTermsLink(locale)`** — builds a link to the frontend Terms page, used in the setup (first-contact) mail.
- **`deletionPurgeAt(requestedAt)`** — returns the earlier of `requestedAt + grace days` and `oneCalendarMonthLaterUtc(requestedAt)`, enforcing GDPR Art. 12(3)'s one-month ceiling regardless of the configured grace.
- **`exportRetentionMs()`** — `NODE_ACCOUNT_EXPORT_TTL_DAYS × DAY_MS`, read at call time so env changes apply immediately.
- **`erasureLedgerRetentionMs()`** — `NODE_ERASURE_LEDGER_RETENTION_DAYS × DAY_MS`; must outlive the oldest backup snapshot.

## Relationships

- **Imports** `defineConfig` from `@infrastructure/config/define`, field constructors from `@infrastructure/config/fields`, and `frontendLink` / `FRONTEND_LINK_RULES` from `@infrastructure/http/frontend-link`. It is the *only* place in the module that knows the link kinds; `frontend-link.ts` is kind-agnostic.
- **Consumed by** account services and emails: `emails.ts` calls the three `*Link` helpers to compose mail bodies; `account-deletion.ts` calls `deletionPurgeAt`; `export-job.ts` / `export.ts` read `exportRetentionMs`; `erasure-ledger.ts` reads `erasureLedgerRetentionMs`; `operator-identity.ts` reads the `NODE_LEGAL_*` fields; `password-reset-request.ts` resolves the `'reset'` link; `consent-record.ts` reads `NODE_TERMS_VERSION`; `jobs.ts` reads TTL fields for reaper scheduling; `module.ts` registers `accountConfig` with the module registry.
- **Imports** `DAY_MS`, `HOUR_MS`, `oneCalendarMonthLaterUtc` from `@domain-primitives/time` for duration arithmetic and the calendar-month cap.

## Notes

- Tokens ride in the URL **fragment** (`#token=…`), not the path or query, so browsers never transmit them in `Host`, `Referer`, or access logs (RFC 3986 §3.5). Do not move them to the query string.
- `NODE_ACCOUNT_DELETION_GRACE_DAYS` has a hard `max: 31` in code, but `deletionPurgeAt` still clamps to one calendar month via `oneCalendarMonthLaterUtc` — the `min` of the two is the effective deadline.
- `NODE_INACTIVE_ACCOUNT_DAYS` defaults to `0` (disabled); `NODE_INACTIVE_MINIMISE_DAYS` defaults to 1095 (3 years).
- `NODE_LEGAL_PHONE` is optional here but required by the `shop` module's own validation (CRD Art. 6(1)(c)); keep it optional in this file.
- The config is read **at call time** (each helper calls `accountConfig()` inside the function body), so changing an env var at runtime takes effect on the next call without a restart.
