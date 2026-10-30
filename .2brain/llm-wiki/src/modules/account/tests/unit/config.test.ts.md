---
source: src/modules/account/tests/unit/config.test.ts
sha256: db7315ea8b146422a1dc547455c13cf940b0846ea24b6e5628252a838f9acf87
generated_at: 2026-10-29T03:03:37.691792+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/config.test.ts

## Purpose

Unit tests for the account config module's three public concerns: the `accountFrontendLink` URL builder (default templates and per-kind env-var overrides), the `NODE_ACCOUNT_DELETION_GRACE_DAYS` validation (default value and 1–31 range), and the `deletionPurgeAt` date calculation (grace-days vs. calendar-month cap).

## Key elements

- **`withoutEnvironmentInThisFile([...])`** — called once at the top of the file; clears six `NODE_*` env vars so tests start from a clean slate.
- **`TOKEN`** — a fixed hex string used as the token argument in every link assertion.
- **`describe('accountFrontendLink — the default template per kind')`** — verifies each of the four kinds (`verify`, `reset`, `restore`, `email-change`) produces the expected `http://localhost:8080/en/…#token=…` URL, and that all four paths are distinct.
- **`describe('accountFrontendLink — per-kind override')`** — sets `NODE_FRONTEND_LINK_RESET` to a custom template and asserts only the reset link changes while verify stays default.
- **`describe('NODE_ACCOUNT_DELETION_GRACE_DAYS')`** — asserts the default is `30` and that values `0` or `32` cause `accountConfig()` to throw.
- **`describe('deletionPurgeAt')`** — asserts the function returns the *shorter* of (a) the grace-days interval and (b) one calendar month, with concrete date arithmetic (e.g., Jan 30 → Feb 28).

## Relationships

- **`src/modules/account/config.ts`** — the module under test. This file imports `accountConfig`, `accountFrontendLink`, and `deletionPurgeAt` from it and exercises their behavior with controlled inputs.
- **`tests/support/environment.ts`** — provides the `withoutEnvironmentInThisFile` and `setEnvironment` helpers used to isolate and manipulate process env vars between test cases.

## Notes

- Default link templates append the token as a **URL hash fragment** (`#token=…`), not a query parameter, despite the first test's description text saying "query param." Custom override templates (set via env var) *can* use query-param syntax (`?t={token}`).
- `deletionPurgeAt` enforces a two-bound cap: the result is always the earlier of "now + grace days" and "first instant of the next calendar month." This is a business rule that is easy to miss without the test.
- All env-var manipulation is scoped to this file via `withoutEnvironmentInThisFile`; the tests do not mutate shared global state beyond what `setEnvironment` provides.
