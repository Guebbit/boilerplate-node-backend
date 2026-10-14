---
source: src/modules/account/config.ts
sha256: ea62db2a4b4bb254b25d59a63929851c13fd6664715267c0bb0594598c88de14
generated_at: 2026-10-14T08:28:38.171501+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/config.ts

## Purpose

Centralises the account module's frontend-link templates, token lifetimes, and export-retention defaults into a single typed config (`accountConfig`), and exposes small helpers that resolve those values into concrete frontend URLs. It exists so that the account module owns *which* links it uses and their defaults, while the generic `infrastructure/http/frontend-link.ts` stays unaware of account-specific kinds (layering rule: infrastructure must not name a module).

## Key elements

- **`AccountLinkKind`** — union type of the five token-bearing link kinds: `'verify' | 'reset' | 'delete' | 'email-change' | 'email-undo'`.
- **`accountConfig`** — the `defineConfig` shape. Fields include five `NODE_FRONTEND_LINK_*` text templates (each defaulting to a route path with `#token={token}`), `NODE_FRONTEND_LINK_EXPORT`, `NODE_PASSWORD_RESET_TTL_MS`, `NODE_EMAIL_VERIFY_TTL_MS`, `NODE_INACTIVE_ACCOUNT_DAYS`, `NODE_INACTIVE_MINIMISE_DAYS`, and `NODE_ACCOUNT_EXPORT_TTL_DAYS`.
- **`accountFrontendLink(kind, { locale, token })`** — resolves the correct env-var template for `kind` and delegates to `frontendLink` to produce the final URL with the token embedded.
- **`accountExportLink(locale, exportId)`** — resolves the export-download link (carries an `id`, not a token). Excluded from `AccountLinkKind` because it requires a signed-in session.
- **`exportRetentionMs()`** — converts `NODE_ACCOUNT_EXPORT_TTL_DAYS` into milliseconds; read at call-site so config changes take effect on the next export build or reaper run.
- **`LINK_ENV_VAR`** (module-private) — maps each `AccountLinkKind` to its corresponding `NODE_FRONTEND_LINK_*` env-var name; satisfies `Record<AccountLinkKind, string>`.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, which turns the shape object into a typed, env-overridable config accessor.
- **`src/infrastructure/config/fields.ts`** — provides `text` and `int` field builders with defaults and constraints.
- **`src/infrastructure/http/frontend-link.ts`** — provides `frontendLink`, which substitutes `{token}`/`{id}` placeholders and prefixes the locale; this file supplies the template string.
- **`src/modules/account/emails.ts`** — consumes `accountFrontendLink` / `accountExportLink` to build the URLs embedded in confirmation and export-ready emails.
- **`src/modules/account/services/password-reset-request.ts`** — reads `NODE_PASSWORD_RESET_TTL_MS` via `accountConfig()` when creating a reset token.
- **`src/modules/account/services/verification.ts`** — reads `NODE_EMAIL_VERIFY_TTL_MS` via `accountConfig()`.
- **`src/modules/account/services/export.ts`** / **`export-job.ts`** / **`export-rows.ts`** — read `NODE_ACCOUNT_EXPORT_TTL_DAYS` (via `exportRetentionMs()`) for cleanup scheduling and the download link.
- **`src/modules/account/module.ts`** — imports this config for module-level wiring (reaper thresholds, email template selection).
- **`scripts/ops/reap-inactive-accounts.ts`** — reads `NODE_INACTIVE_ACCOUNT_DAYS` and `NODE_INACTIVE_MINIMISE_DAYS` to decide which accounts to deactivate.
- **`src/modules/account/tests/unit/config.test.ts`** — unit-tests the defaults and `accountFrontendLink` output.
- **`src/modules/account/tests/unit/emails.test.ts`** — exercises link generation through the email templates.

## Notes

- Tokens ride in the **URL fragment** (`#token=…`), never in the path or query. Browsers do not send fragments to servers, so they never appear in access logs, proxy logs, or `Referer` headers (RFC 3986 §3.5). Do not change templates to use `?token=`.
- `NODE_INACTIVE_ACCOUNT_DAYS` defaults to **0**, which means "no inactivity-based deactivation" unless explicitly set; the minimum is 0, not 1.
- `NODE_INACTIVE_MINIMISE_DAYS` defaults to **1095** (3 years) — a much longer window than the deactivation window.
- The export link (`NODE_FRONTEND_LINK_EXPORT`) is intentionally **not** part of `AccountLinkKind`; it uses `{id}` instead of `{token}` and requires an authenticated session on the frontend side.
- All config values are read **at call time** (via `accountConfig()`), not captured at import, so `.env` changes take effect without a restart.
