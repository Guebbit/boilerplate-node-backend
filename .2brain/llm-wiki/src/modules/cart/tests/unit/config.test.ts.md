---
source: src/modules/cart/tests/unit/config.test.ts
sha256: 14994b6dca56791ea70e96baa7227b7b9a89e4e4856ffe9f408d57633f02d201
generated_at: 2026-10-14T15:19:38.178287+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/config.test.ts

## Purpose

Unit tests for the cart's checkout-cap configuration, specifically `maxOpenUnpaidOrdersPerAccount`. Because the function under test is a pure environment-variable read (no I/O, no HTTP), the unit suite is sufficient here; the resulting 409 response is exercised separately in the integration suite.

## Key elements

- **`TOUCHED`** – A frozen list of every environment variable the suite manipulates (`NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT`). Passed to `withoutEnvironmentInThisFile` so the variable is cleared before each test and restored after the file finishes.
- **`describe('maxOpenUnpaidOrdersPerAccount')`** – Three test cases:
  - *Defaults to 2* – asserts the fallback when the env var is absent.
  - *Reads env var when set* – sets the var to `'5'` and expects the numeric `5`.
  - *Refuses a ceiling below 1* – sets the var to `'0'` and expects the function to **throw**, because an account must be able to hold at least the order it is placing.

## Relationships

- **`src/modules/cart/config.ts`** – The function under test (`maxOpenUnpaidOrdersPerAccount`) is imported from this module.
- **`tests/support/environment.ts`** – Provides the two helpers used throughout: `withoutEnvironmentInThisFile` (per-file env isolation) and `setEnvironment` (per-test env mutation).

## Notes

- The file deliberately does **not** assert the 409 status code; that behaviour belongs to the integration suite (noted in the module docblock).
- The `TOUCHED` array must be kept in sync with any new env vars the tests drive, or `withoutEnvironmentInThisFile` will not clean them up.
- The "0" case is a boundary guard: the function throws rather than returning 0, preventing a configuration that would reject every checkout.
