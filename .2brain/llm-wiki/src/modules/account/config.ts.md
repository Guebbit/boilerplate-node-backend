---
source: src/modules/account/config.ts
sha256: 7fa028c9bdd549b75399475bc905c634643626d054a067f5306bd17f725d506e
generated_at: 2026-10-29T02:25:31.847217+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/config.ts

## Purpose

Central configuration surface for the `account` module: frontend link templates (with their `NODE_FRONTEND_LINK_*` env overrides), token/TTL lifetimes, and account-lifecycle constants. It exists so that every account-related setting has one typed, overridable home, and so that the five token-bearing link kinds are declared alongside the infrastructure that turns them into URLs—without `infrastructure/http` ever naming the `account` module (see `docs/theory/layers.md`).

## Key elements

- **`AccountLinkKind`** — union type of the five token-bearing link kinds: `'verify' | 'reset' | 'restore' | 'email-change' | 'email-undo'`.
- **`accountConfig`** — `defineConfig` object exposing all `NODE_*` variables: five link-template strings, an export link, password-reset TTL, email-verify TTL, inactive-account thresholds, export retention days, deletion grace days, terms version, and support email.
- **`accountFrontendLink(kind, { locale, token })`** — resolves one of the five token-bearing links via `frontendLink`; the token is placed in the URL fragment (`#token=`) so it never reaches a server.
- **`accountExportLink(locale)`** — resolves the "your export is ready" download link. Carries **no** token; the download route requires a signed-in session.
- **`deletionPurgeAt(requestedAt)`** — returns the earlier of `requestedAt + grace days` and one calendar month later (UTC midnight). Enforces the GDPR Art. 12(3) one-month ceiling.
- **`exportRetentionMs()`** — returns the export-retention window in milliseconds. Reads config at call time, so a changed value applies to the next build/reaper run.

## Relationships

- **`@infrastructure/config/define` + `@infrastructure/config/fields`** — provides the `defineConfig` builder and `text`/`int`/`email` field primitives used to declare the shape.
- **`@infrastructure/http/frontend-link`** — supplies `frontendLink` (template → URL) and `FRONTEND_LINK_RULES` (default route templates). This file owns the *kinds*; `frontend-link` is kind-agnostic.
- **`@domain-primitives/time`** — `DAY_MS` for ms conversions; `oneCalendarMonthLaterUtc` for the GDPR one-month cap in `deletionPurgeAt`.
- **Consumers** (all under `src/modules/account/…`): `emails.ts` builds confirmation mails using `accountFrontendLink`; `verification.ts`, `password-reset-request.ts`, `export.ts` / `export-job.ts` / `export-rows.ts` read TTLs and links; `account-deletion.ts` calls `deletionPurgeAt`; `consent-record.ts`, `jobs.ts`, and `module.ts` reference the config for lifecycle decisions; `delete-account.test.ts` exercises the purge boundary.

## Notes

- **Token in the fragment, not the path.** `#token=…` is stripped by browsers before the request hits any proxy/access log (RFC 3986 §3.5). Do not move it to a query parameter.
- **`accountExportLink` is not a `AccountLinkKind`.** It takes no token and is not in the `LINK_ENV_VAR` map; treat it as a separate, session-gated link.
- **`NODE_ACCOUNT_DELETION_GRACE_DAYS` max = 31** is a *code-level* ceiling (longest month), not a wire contract. The real runtime cap is the one-calendar-month floor in `deletionPurgeAt`, which guards against 30/31-day drift (e.g. 31 Jan + 30 d = 2 Mar).
- **`exportRetentionMs` is a function, not a constant.** It re-reads `accountConfig()` each call so an env change takes effect on the next export build and reaper sweep without a restart.
