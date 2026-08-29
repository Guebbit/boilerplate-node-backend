# tests/support/environment.ts

## Purpose

Provides a single test helper, `withEnvironment`, that temporarily sets one `process.env` key for the duration of an async test body and then restores the original state. It exists because the codebase's config layer (`@infrastructure/runtime/environment`) reads every value lazily at the point of use, so tests can vary a single setting in isolation — but only if the variable is reliably restored afterward.

## Key elements

- **`withEnvironment(key, value, body)`** — Sets `process.env[key]` to `value`, awaits `body()`, then restores the key in a `finally` block. If the key was previously unset (`undefined`) it deletes the key; if it held a value (including an empty string) it writes that value back.

## Relationships

- **`src/modules/cart/tests/integration/stock.test.ts`** — Imports `withEnvironment` to toggle environment-driven config values (e.g., stock thresholds) for individual test cases.
- **`src/modules/inventory/tests/integration/service.test.ts`** — Same pattern; uses the helper to vary inventory-service configuration per case without cross-test leakage.
- **`@infrastructure/runtime/environment`** — The lazy config reader that `withEnvironment` is designed to work *with*. Because that module reads `process.env` at call time rather than at import time, the set-then-restore pattern is sufficient to influence a single execution path.

## Notes

- The restore logic deliberately distinguishes `undefined` (key absent) from `""` (key present, empty value). Deleting a key that previously held a value, or leaving `""` where no key existed, are both treated as an environment change for subsequent readers — so the helper always restores the exact prior state.
- The function is `async` and the body must return `Promise<void>`; the `finally` guarantees restoration even if `body` throws.
- This is a test-support module: it is imported only from test files, never from production source.
