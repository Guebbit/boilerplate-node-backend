---
source: src/modules/account/tests/unit/operator-identity.test.ts
sha256: ba51ffe4e6c610886aa0d56601ef19d8a490706f366d0ea4b6b20166bc0a7f19
generated_at: 2026-11-08T04:48:23.135668+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/operator-identity.test.ts

## Purpose

Unit tests for the account module's operator-identity service and its boot gate. Verifies that `assertModuleConfig` refuses to boot when any required `NODE_LEGAL_*` variable is missing, and that `operatorIdentity()` correctly reads required fields, omits unset optional fields, falls back to `NODE_SUPPORT_EMAIL`, and prefers `NODE_LEGAL_EMAIL` when both are set.

## Key elements

- **`REQUIRED`** – const object listing the five mandatory `NODE_LEGAL_*` env variables and a satisfying sample value for each.
- **`REQUIRED_VARIABLES`** – `Object.keys(REQUIRED)` cast to `(keyof typeof REQUIRED)[]`; used to drive `it.each` and the cleanup list.
- **`withoutEnvironmentInThisFile(…)`** – called at module level; guarantees none of the `NODE_LEGAL_*` / `NODE_SUPPORT_EMAIL` variables leak in from the host environment.
- **`describe('the operator boot gate', …)`** – two tests: one parameterised over each required variable asserting a boot failure, one confirming boot succeeds with only the required set (phone optional).
- **`describe('operatorIdentity', …)`** – three tests covering: required-only read, optional fields + email fallback/priority, and the throw when a required field is absent.

## Relationships

- **`src/modules/account/services/operator-identity.ts`** – the system under test; `operatorIdentity()` is the pure function exercised in the second describe block.
- **`src/kernel/module-config.ts`** – provides `assertModuleConfig`, the boot-validation entry point used by the first describe block.
- **`src/modules/account/module.ts`** – imported as `accountModule` and passed to `assertModuleConfig` so the real module config rules are checked.
- **`src/modules/account/services/index.ts`** – re-export barrel from which `operatorIdentity` is imported.
- **`tests/support/environment.ts`** – supplies `withoutEnvironmentInThisFile` (cleanup) and `setEnvironment` (per-test env mutation).

## Notes

- The boot-gate tests explicitly set `NODE_ENV: 'development'` because `assertModuleConfig` short-circuits (skips validation) under `NODE_ENV=test`. Forgetting this makes the tests pass trivially.
- `withoutEnvironmentInThisFile` is called at the **top of the module**, not inside a `beforeEach`, so the env is cleared once before any test runs.
- The `email` field has a fallback chain: `NODE_LEGAL_EMAIL` → `NODE_SUPPORT_EMAIL` → (error if neither). The tests assert both branches.
- `operatorIdentity()` throws (rather than returning partial data) when a required field is missing, which is distinct from the boot-gate path—both guard the same variables but at different lifecycle points.
