---
source: src/modules/account/tests/unit/config.test.ts
sha256: db7315ea8b146422a1dc547455c13cf940b0846ea24b6e5628252a838f9acf87
generated_at: 2026-11-08T04:45:40.509598+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/config.test.ts

## Purpose

Unit tests for the account module's configuration surface: the `accountFrontendLink` URL builder (four link kinds), the `NODE_ACCOUNT_DELETION_GRACE_DAYS` validation, and the `deletionPurgeAt` date computation. The file exists to pin down default URL templates, per-kind env-var overrides, grace-day bounds, and the calendar-month cap logic without touching the network layer.

## Key elements

- **`withoutEnvironmentInThisFile([...])`** (top-level, file-scoped): clears six `NODE_FRONTEND_LINK_*` / `NODE_ACCOUNT_DELETION_GRACE_DAYS` env vars before any test runs, guaranteeing a clean starting state.
- **`TOKEN`** constant (`'a1b2c3d4e5f6'`): single placeholder token reused across all link-building assertions.
- **`describe('accountFrontendLink — the default template per kind')`**: asserts the exact URL produced for `verify`, `reset`, `restore`, and `email-change` (base `http://localhost:8080`), plus a distinctness check that no two kinds yield the same path.
- **`describe('accountFrontendLink — per-kind override')`**: sets `NODE_FRONTEND_LINK_RESET` via `setEnvironment` and verifies only the reset template changes while the verify template stays intact.
- **`describe('NODE_ACCOUNT_DELETION_GRACE_DAYS')`**: confirms the default is `30`; asserts `0` and `32` throw on config load.
- **`describe('deletionPurgeAt')`**: verifies the purge timestamp is the earlier of "grace-days-later" or "start of the next calendar month," including a February edge case (Jan 30 → Feb 28) and a 31-day grace that still clamps to the month boundary.

## Relationships

- **`src/modules/account/config.ts`** — the module under test. This file imports `accountConfig`, `accountFrontendLink`, and `deletionPurgeAt` directly from it and asserts on their return values / thrown errors.
- **`tests/support/environment.ts`** — provides the `withoutEnvironmentInThisFile` and `setEnvironment` helpers used to isolate and mutate `process.env` for each test.

## Notes

- The file relies on a **file-level** `withoutEnvironmentInThisFile` call (not a per-test `beforeEach`) to reset the six relevant env vars. Any new env var added to `accountFrontendLink` must also be listed there, or stale values from other test files can leak in.
- `deletionPurgeAt` has a **calendar-month cap** in addition to the grace-days offset; the tests explicitly pin this dual-bound behavior (grace *and* month), which is non-obvious from the function name alone.
- The token is always a fragment identifier (`#token=…`), not a query param — the default templates use `#`, but a deployment override can switch to `?` (as shown in the reset-override test).
