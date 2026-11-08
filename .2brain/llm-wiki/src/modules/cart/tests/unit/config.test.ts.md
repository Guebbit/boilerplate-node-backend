---
source: src/modules/cart/tests/unit/config.test.ts
sha256: 14994b6dca56791ea70e96baa7227b7b9a89e4e4856ffe9f408d57633f02d201
generated_at: 2026-11-08T05:24:07.202851+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/config.test.ts

## Purpose

Unit tests for `maxOpenUnpaidOrdersPerAccount`, a pure env-var reader in the cart config. Because the function only reads an environment variable (no I/O, no HTTP), a unit suite is sufficient here; the 409 response it ultimately causes is covered in the integration suite instead.

## Key elements

- **`TOUCHED`** – A readonly array (`['NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT']`) listing every env var the tests mutate. Passed to `withoutEnvironmentInThisFile` so the harness saves/restores it around the whole file.
- **`describe('maxOpenUnpaidOrdersPerAccount')`** – Contains three cases:
  - Default value is **2** (allows one retry while a card hold expires).
  - Reads `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT` when the variable is set (e.g. `'5'` → `5`).
  - Throws when the ceiling is **0** or lower, because an account must be able to hold at least the order it is placing.

## Relationships

- **`src/modules/cart/config.ts`** – Exports `maxOpenUnpaidOrdersPerAccount`, the function under test.
- **`tests/support/environment.ts`** – Provides `withoutEnvironmentInThisFile` (file-level env isolation) and `setEnvironment` (per-test variable injection) used to drive the three cases.

## Notes

- The `TOUCHED` + `withoutEnvironmentInThisFile` pattern means you must add any newly-touched env var to `TOUCHED` when writing a new case, or the variable will leak between tests.
- The "refuses a ceiling below 1" test asserts a **throw**, not a clamped value—changing the config to clamp instead of throw would break this test silently if you only check the happy path.
