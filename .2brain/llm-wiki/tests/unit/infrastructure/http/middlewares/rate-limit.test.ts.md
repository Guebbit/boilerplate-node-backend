---
source: tests/unit/infrastructure/http/middlewares/rate-limit.test.ts
sha256: 2870523b6956fa8acc48158d56f1461e015d20c99ed17701ddcdbf19bcbc68e8
generated_at: 2026-09-23T20:22:11.822803+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit.test.ts

## Purpose

Unit test that pins the four global rate-limit budget constants (browsing window, browsing max, API-key max, upload max) and asserts their relative sizing. It exists so that any future change to these shared defaults is caught at the unit level, independent of the behavioral (request-through-middleware) tests.

## Key elements

- **`describe('rate limit defaults')`** — the sole test suite; three specs:
  - *browsing budget*: asserts `DEFAULT_RATE_LIMIT_WINDOW_MS === 60_000` and `DEFAULT_RATE_LIMIT_MAX === 100`.
  - *upload budget*: asserts `DEFAULT_UPLOAD_RATE_LIMIT_MAX < DEFAULT_RATE_LIMIT_MAX / 2`.
  - *API-key budget*: asserts `DEFAULT_UPLOAD_RATE_LIMIT_MAX < DEFAULT_API_KEY_RATE_LIMIT_MAX < DEFAULT_RATE_LIMIT_MAX * 2`.
- **Imported constants** (from `@infrastructure/http/middlewares/rate-limit`): `DEFAULT_RATE_LIMIT_MAX`, `DEFAULT_RATE_LIMIT_WINDOW_MS`, `DEFAULT_API_KEY_RATE_LIMIT_MAX`, `DEFAULT_UPLOAD_RATE_LIMIT_MAX`.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — sole import source; this test reads its exported numeric constants and asserts on them. No other runtime interaction.

## Notes

- **Behavioral testing is intentionally absent.** Sending a real request through `express-rate-limit` is classified as an integration concern by the project's `no-restricted-imports` rule; that coverage lives in module-level integration tests (e.g. `src/modules/feedback/tests/integration/submission-rate-limit.test.ts`).
- **The window constant is considered load-bearing.** The header comment warns that reinterpreting "100 requests" without the 60-second window turns a per-minute cap into a session quota.
- **Cross-cutting budget relationships** (e.g. a module's own limit staying a fraction of the global browsing budget) are tested separately in `tests/cross-cutting/rate-limit-budgets.test.ts`, not here.
- **Per-module rate-limit tests** (e.g. `src/modules/account/tests/unit/rate-limits.test.ts`) pin each module's own budget; this file only covers the three shared/global defaults.
