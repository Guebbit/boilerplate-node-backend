---
source: src/modules/account/tests/unit/config.test.ts
source_sha256: c38b281ce7d72f8047e34aa4c9b99787138099316ec3f751c6d803c306bcf22d
context_sha256: 8ba0d838c8f5fa1616ea4d7f0b9b344fad0409d876fc05b6411698b50c2a298c
generated_at: 2026-11-22T04:03:53.820547+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/config.test.ts

## Purpose
Unit tests for the account module's config (`@modules/account/config`). They cover the default frontend link templates for each token flow, the per-kind environment override, the deletion grace-period setting, and the computation of the purge date for a deleted account.

## Key elements
- **`withoutEnvironmentInThisFile([...])`**: clears `NODE_FRONTEND_URL`, `NODE_FRONTEND_LINK_VERIFY`, `NODE_FRONTEND_LINK_RESET`, `NODE_FRONTEND_LINK_RESTORE`, `NODE_FRONTEND_LINK_EMAIL_CHANGE` and `NODE_ACCOUNT_DELETION_GRACE_DAYS`, so the defaults are what get tested.
- **`TOKEN`**: a fixed opaque token (`a1b2c3d4e5f6`) used in the expected URLs.
- **`accountFrontendLink — the default template per kind`**: with `locale: 'en'`, the default base is `http://localhost:8080`.
  - `verify` gives `/en/verify-email/confirm#token=…`.
  - `reset` gives `/en/password-reset/confirm#token=…`.
  - `setup` gives `/en/account-setup#token=…`.
  - `restore` gives `/en/account-restore#token=…`.
  - `email-change` gives `/en/email-change/confirm#token=…`.
  - A test checks that the five kinds produce distinct URLs.
  - `accountTermsLink('en')` gives `/en/terms`.
- **`accountFrontendLink — per-kind override`**: setting `NODE_FRONTEND_LINK_RESET='change-password?t={token}'` changes only the reset link. The verify link keeps its default.
- **`NODE_ACCOUNT_DELETION_GRACE_DAYS`**: `accountConfig()` defaults it to 30. It throws for `'0'` and `'32'`, so the valid range is 1–31.
- **`deletionPurgeAt`**:
  - With the default 30-day grace, 5 March 10:00Z gives 4 April 10:00Z.
  - 30 January gives 28 February at 00:00Z, which is the calendar-month bound.
  - With grace 31, 30 April 23:00Z gives 30 May 00:00Z, and 5 March gives 5 April at 00:00Z. The purge date never goes past one calendar month.

## Relationships
- Tests `accountConfig`, `accountFrontendLink`, `accountTermsLink` and `deletionPurgeAt`, all imported from `src/modules/account/config.ts`.
- Uses `withoutEnvironmentInThisFile` and `setEnvironment` from the `@tests/environment` alias (`tests/support/environment.ts`) to control env vars.

## Notes
- The header comment says the env vars and default templates for the link kinds live in this module's config. `src/infrastructure/http/frontend-link.ts` only turns a resolved template into a URL.
- `setup` has no env var in the cleared list, and no override test covers it.
- When the purge date is bounded by the month, the time is reset to `00:00:00Z`. When the grace is the shorter bound, the original time of day is kept.
