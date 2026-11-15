---
source: src/modules/account/tests/unit/config.test.ts
sha256: 3d485f798a49e234d6225d370eb9b155ffaab999efadf0269b48d840eccf290d
generated_at: 2026-11-14T19:13:43.531828+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/config.test.ts

## Purpose

Unit tests for the account module's frontend-link URL templates and account-deletion grace-period logic. Verifies that each link kind produces a correct, distinct URL, that per-kind env-var overrides work in isolation, and that the deletion purge date respects both the configured grace window and calendar-month boundaries.

## Key elements

- **`withoutEnvironmentInThisFile([...])`** — called at module scope to guarantee a clean env state (clears `NODE_FRONTEND_URL`, all `NODE_FRONTEND_LINK_*` vars, and `NODE_ACCOUNT_DELETION_GRACE_DAYS`) before any test in this file runs.
- **`describe('accountFrontendLink — the default template per kind')`** — asserts the default URL for each of the five link kinds (`verify`, `reset`, `setup`, `restore`, `email-change`) plus `accountTermsLink`, and confirms all five link-kind URLs are pairwise distinct.
- **`describe('accountFrontendLink — per-kind override')`** — sets `NODE_FRONTEND_LINK_RESET` and verifies only the `reset` template changes while others remain default.
- **`describe('NODE_ACCOUNT_DELETION_GRACE_DAYS')`** — checks the default (30) and that out-of-range values (`0`, `32`) cause `accountConfig()` to throw.
- **`describe('deletionPurgeAt')`** — verifies the purge timestamp is the *earlier* of (deletion date + grace days) and (first day of the next calendar month), with edge cases around February and month-end.

## Relationships

- **`src/modules/account/config.ts`** — the module under test. This file imports `accountConfig`, `accountFrontendLink`, `accountTermsLink`, and `deletionPurgeAt` and exercises their public contracts.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile` (used at file top to reset env vars) and `setEnvironment` (used inside individual tests to inject a single variable override).

## Notes

- The token in every URL is passed as a **fragment identifier** (`#token=…`), not a query string, except where a custom override template explicitly uses `?t=`. Tests assert the exact string, so the hash-vs-query distinction is intentional.
- `deletionPurgeAt` is capped at the first day of the following month at midnight UTC (`T00:00:00.000Z`), which is a stricter bound than the grace-day calculation. Tests pin this with the "never passes the month" case.
- `NODE_ACCOUNT_DELETION_GRACE_DAYS` is validated in the `1–31` range; the test uses `it.each` with string values (`'0'`, `'32'`) because env vars are always strings.
