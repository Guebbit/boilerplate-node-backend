---
source: src/modules/observability/tests/unit/health-identity.test.ts
source_sha256: c2b43fc741a769e61f779493a6c7bf6b27d700b527227d3e55d4077c802a516b
context_sha256: 34facff7e7305ae0b75b77a0c5abc9544ba3fa4a6c6e45d353d0723404021fec
generated_at: 2026-11-22T06:05:07.920949+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/health-identity.test.ts

## Purpose
Unit tests for the two identity fields of the `GET /observability/health` payload, `environment` and `service`, which say which process answered. It exercises `buildObservabilityHealth` and nothing else about the payload.

## Key elements
- `jest.mock('../../services/job-health', ...)`: stubs `jobHealth` to resolve `[]`.
- `jest.mock('../../services/parked-jobs', ...)`: stubs `queueHealth` to resolve `[]`. Both mocks are there because what those functions read is covered by their own suites.
- `describe('buildObservabilityHealth identity')` with four cases:
  - Unset `NODE_ENV` gives `environment: 'unset'`. The test name says an unset value is a deployment, not development.
  - `NODE_ENV='staging'` gives `environment: 'staging'`, reported as written.
  - Unset `NODE_SERVICE_NAME` gives `service: 'api'`. The test name says this matches how logs and traces name the service.
  - `NODE_SERVICE_NAME='shop-api'` gives `service: 'shop-api'`.
- Each case calls `setEnvironment({...})` and asserts with `resolves.toMatchObject`, so only the identity field is checked and other payload fields are ignored.

## Relationships
- `src/modules/observability/services/health.ts`: provides `buildObservabilityHealth`, the function under test.
- `tests/support/environment.ts`: provides `setEnvironment`, imported via the `@tests/environment` alias. It sets `NODE_ENV` and `NODE_SERVICE_NAME` for each case, and `undefined` is passed to leave a variable unset.

## Notes
- The `jest.mock` calls come before the imports so the stubs are in place when `health` loads its dependencies.
- The file does not show whether `setEnvironment` restores values between tests. Check `tests/support/environment.ts` if test isolation matters.
