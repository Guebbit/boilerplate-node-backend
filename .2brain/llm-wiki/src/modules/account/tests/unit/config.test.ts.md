---
source: src/modules/account/tests/unit/config.test.ts
sha256: db7c112927fec1b213be4dd70de6879c72c95b4114f5c96fe211a12f9d85cb67
generated_at: 2026-10-14T09:18:57.043846+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/config.test.ts

## Purpose

Unit tests for `accountFrontendLink`, the helper that maps a link *kind* (verify, reset, delete, email-change) plus a locale and token to a full frontend URL. The file validates both the built-in default templates and the per-kind environment-variable override mechanism, ensuring each kind resolves to a distinct path and that overriding one kind does not affect the others.

## Key elements

- **`accountFrontendLink`** (imported from `@modules/account/config`) — the function under test; takes a kind, a locale, and a token and returns a fully-resolved frontend URL.
- **`withoutEnvironmentInThisFile`** (imported from `@tests/environment`) — called at module scope to guarantee the five `NODE_FRONTEND_LINK_*` env vars are unset for every test in this file, preventing cross-test contamination.
- **`setEnvironment`** (imported from `@tests/environment`) — used inside the override test to set a single env var for the duration of that test.
- **`TOKEN`** — a fixed hex string (`a1b2c3d4e5f6`) used as the token argument in all assertions.
- **`describe('accountFrontendLink — the default template per kind')`** — four tests (one per kind) asserting the exact expected URL, plus one test asserting all four URLs are pairwise distinct.
- **`describe('accountFrontendLink — per-kind override')`** — sets `NODE_FRONTEND_LINK_RESET` and asserts that only the reset URL changes while the verify URL remains the default.

## Relationships

- **`src/modules/account/config.ts`** — exports `accountFrontendLink`; this test file is its primary unit-test consumer. All assertions here validate the behavior defined in that module.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile` (module-level env isolation) and `setEnvironment` (per-test env mutation). The test file relies on both for a hermetic environment.

## Notes

- The file's doc comment records a **D14 architectural fix**: env vars and default templates intentionally live in `config.ts` (account domain) rather than in `infrastructure/http/frontend-link.ts`, which only performs template-to-URL resolution.
- Tokens are embedded as a **URL fragment** (`#token=…`) in the default templates, not as a query parameter. The override test uses a `?t=` query-param style, showing the template string is fully operator-controlled.
- `withoutEnvironmentInThisFile` is called at the top level (not inside a `beforeEach`), so the env reset applies for the lifetime of the file's test run.
