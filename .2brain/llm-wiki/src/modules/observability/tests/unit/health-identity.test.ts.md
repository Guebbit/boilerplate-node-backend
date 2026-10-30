---
source: src/modules/observability/tests/unit/health-identity.test.ts
sha256: c2b43fc741a769e61f779493a6c7bf6b27d700b527227d3e55d4077c802a516b
generated_at: 2026-10-29T04:37:19.303316+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/health-identity.test.ts

## Purpose

Unit tests that verify `buildObservabilityHealth` correctly populates the two identity fields (`environment` and `service`) in the `GET /observability/health` response. Job and queue health are mocked away so the suite isolates "which process answered" from "what jobs/queues report."

## Key elements

- **`jest.mock` for `job-health` / `parked-jobs`** – forces both to resolve to `[]`, removing them from the assertion surface.
- **`describe('buildObservabilityHealth identity')`** – single suite containing four cases:
  - *Unset `NODE_ENV`* → `environment` is the string `'unset'` (not `undefined`).
  - *Set `NODE_ENV` (`'staging'`)* → `environment` mirrors the value verbatim.
  - *Unset `NODE_SERVICE_NAME`* → `service` defaults to `'api'`.
  - *Set `NODE_SERVICE_NAME` (`'shop-api'`)* → `service` mirrors the value verbatim.

## Relationships

- **`src/modules/observability/services/health.ts`** – source of `buildObservabilityHealth`, the function under test.
- **`tests/support/environment.ts`** – provides `setEnvironment`, the shared helper used to control `NODE_ENV` / `NODE_SERVICE_NAME` per test case.

## Notes

- The file's own doc comment states the design intent: this suite is about *naming* the process, not about health data. Keep new assertions here limited to `environment` / `service` shape.
- Unset `NODE_ENV` is deliberately reported as `'unset'` (a deployment scenario), not `'development'` or omitted.
- Service name fallback (`'api'`) is a product convention, not a runtime default—assert it explicitly when changing the fallback.
