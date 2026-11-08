---
source: src/modules/observability/tests/unit/health-identity.test.ts
sha256: c2b43fc741a769e61f779493a6c7bf6b27d700b527227d3e55d4077c802a516b
generated_at: 2026-11-08T06:43:04.561366+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/health-identity.test.ts

## Purpose

Unit tests for the **identity fields** (`environment` and `service`) that `GET /observability/health` reports to identify which process answered. Job/queue health data is mocked out so this suite focuses solely on how the payload names the process.

## Key elements

- **Mocks** — `jobHealth` and `queueHealth` are stubbed to resolve empty arrays, keeping the suite scoped to identity logic.
- **`setEnvironment`** (imported from `tests/support/environment.ts`) — sets `NODE_ENV` and `NODE_SERVICE_NAME` per test case.
- **`buildObservabilityHealth`** (imported from `../../services/health`) — the function under test; asserted via `toMatchObject` on the `environment` and `service` keys.
- **Four cases** covering:
  - `NODE_ENV` unset → `environment: 'unset'`
  - `NODE_ENV = 'staging'` → `environment: 'staging'`
  - `NODE_SERVICE_NAME` unset → `service: 'api'` (default)
  - `NODE_SERVICE_NAME = 'shop-api'` → `service: 'shop-api'`

## Relationships

- **`src/modules/observability/services/health.ts`** — provides `buildObservabilityHealth`, the SUT. This test exercises only its identity-reporting path.
- **`tests/support/environment.ts`** — provides `setEnvironment`, the helper that mutates process env vars before each assertion.

## Notes

- An *unset* `NODE_ENV` is intentionally reported as the literal string `'unset'` (not `undefined`/`null`), reflecting the project's convention that a missing value in production means "deployment, not development."
- The default service name `'api'` is a fallback when `NODE_SERVICE_NAME` is absent; it matches the naming used in logs and traces.
- `jobHealth` / `queueHealth` mocks live in this file (not a shared setup) because their correctness is asserted in their own suites.
