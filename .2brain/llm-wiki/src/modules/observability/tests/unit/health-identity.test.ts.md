---
source: src/modules/observability/tests/unit/health-identity.test.ts
sha256: 63157bdc63c7ac6f2375ece5e4ee39948485319db7ced37d5fa2c330754d73a0
generated_at: 2026-10-15T10:57:21.591842+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/health-identity.test.ts

## Purpose

Unit tests that verify how `buildObservabilityHealth` names the answering process in the `GET /observability/health` payload — specifically the `environment` and `service` fields. The job- and queue-health sub-responses are mocked out so this suite focuses exclusively on identity reporting, leaving those concerns to their own test files.

## Key elements

- **`jest.mock('../../services/job-health')`** — stubs `jobHealth` to resolve `[]`, removing it from the test's scope of concern.
- **`jest.mock('../../services/parked-jobs')`** — stubs `queueHealth` to resolve `[]`, same rationale.
- **`setEnvironment` / `resetEnvironment`** (from `@tests/environment`) — helpers that mutate and restore `process.env` around each test. `resetEnvironment` is registered in a top-level `afterEach`.
- **`buildObservabilityHealth`** (from `../../services/health`) — the async function under test; each `it` asserts a slice of its resolved object with `toMatchObject`.
- **Four test cases:**
  - `NODE_ENV` unset → `environment` is the literal string `'unset'`.
  - `NODE_ENV` set (e.g. `'staging'`) → `environment` echoes the value.
  - `NODE_SERVICE_NAME` unset → `service` defaults to `'api'`.
  - `NODE_SERVICE_NAME` set (e.g. `'shop-api'`) → `service` echoes the value.

## Relationships

- **`src/modules/observability/services/health.ts`** — exports `buildObservabilityHealth`, the function being tested. This is the sole system-under-test dependency.
- **`tests/support/environment.ts`** — provides `setEnvironment` (sets arbitrary `NODE_ENV` / `NODE_SERVICE_NAME` values) and `resetEnvironment` (restores prior env), used to make each test hermetic.
- **`../../services/job-health`** and **`../../services/parked-jobs`** — imported only to be *mocked*; the tests never exercise their real logic.

## Notes

- The mocks are declared **before** the import of `buildObservabilityHealth`, which is required for Jest to hoist them correctly. Forgetting the ordering (or using ESM `import` before the `jest.mock` call) will silently un-mock the modules.
- `'unset'` is a deliberate sentinel string, not `undefined` or an empty string. Tests asserting identity should compare against that exact value, not falsiness.
- The default service name `'api'` is a hard-coded fallback in the implementation, not derived from any config file; changing it upstream will break the third test.
