---
source: src/modules/cart/tests/unit/config.test.ts
source_sha256: 14994b6dca56791ea70e96baa7227b7b9a89e4e4856ffe9f408d57633f02d201
context_sha256: 84b77308ba7a567fea1689e52605d038d9c2aa4bd8199430b23f567cf82a4247
generated_at: 2026-11-22T04:42:47.763814+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/unit/config.test.ts

## Purpose
Unit tests for the cart module's checkout cap configuration. `maxOpenUnpaidOrdersPerAccount()` only reads environment variables, so a unit suite is sufficient. The HTTP 409 that this cap produces is verified in the integration suite, not here.

## Key elements
- `TOUCHED`: the list of env vars these tests drive (`NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT`). The list is passed to `withoutEnvironmentInThisFile`.
- `withoutEnvironmentInThisFile(TOUCHED)`: clears those variables before each case and restores them after the file.
- `describe('maxOpenUnpaidOrdersPerAccount')` has three cases:
  - Defaults to `2` when the variable is unset. The test names the reason: a failed card can be retried while its hold runs out.
  - Returns `5` when the variable is set to `'5'`, via `setEnvironment`.
  - Throws when the variable is `'0'`. A ceiling below 1 is refused because it would reject every checkout, and an account must be able to hold at least the order it places.

## Relationships
- `src/modules/cart/config.ts`: provides `maxOpenUnpaidOrdersPerAccount`, the function under test.
- `tests/support/environment.ts`: provides `withoutEnvironmentInThisFile` and `setEnvironment`. They are imported through the `@tests/environment` alias.

## Notes
- The tests assert only that the zero case throws. They do not check the error type or message.
- Only `0` is tested as an invalid value. Other invalid inputs, such as negative or non-numeric values, are not covered here.
