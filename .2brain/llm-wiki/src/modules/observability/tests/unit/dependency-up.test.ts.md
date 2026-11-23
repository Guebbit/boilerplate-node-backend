---
source: src/modules/observability/tests/unit/dependency-up.test.ts
source_sha256: 16e419c14df08107693f6e082faf5e8a6c1825305c7a77bd0111dbcd4b0ebdd8
context_sha256: 1043ad9d4a04a655ee57f6b3ce6a913402798f30b78d4e317d7ecfa2133f97ad
generated_at: 2026-11-22T06:04:43.120996+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/dependency-up.test.ts

## Purpose
Unit tests for the `dependency_up` Prometheus gauge. They pin down how the readiness vocabulary (`ready`, `unavailable`, `connecting`, `disabled`) maps to a gauge value of 1, 0, or no sample at all. The header comment notes that the `DependencyUnavailable` alert relies on this mapping.

## Key elements
- `jest.mock('../../services/dependency-health', ...)`: replaces the module with `{ dependencyHealth: jest.fn() }`, so each test chooses what every dependency reports.
- `mockedDependencyHealth`: the typed `jest.mocked(dependencyHealth)` handle used to set return values.
- `reading(overrides)`: builds a `DependencyHealth` with `database`, `cache` and `queue` all `'ready'`, then applies per-case overrides.
- `describe('dependency_up')` cases, each of which calls `getPrometheusMetrics()` and asserts on the exposition text:
  - All dependencies ready: `dependency_up{dependency="database"|"cache"|"queue"} 1`.
  - `database: 'unavailable'`: the database series is `0`.
  - `cache: 'connecting'`: the cache series is `0` ("not serving yet").
  - `queue: 'disabled'`: no `dependency="queue"` series appears, while the database series is still `1`.

## Relationships
- `src/modules/observability/services/dependency-health.ts`: supplies `dependencyHealth` and the `DependencyHealth` type. It is mocked here, and the real implementation never runs.
- `src/modules/observability/metrics.ts`: imported for its side effects (`import '../../metrics'`). Judging by the tests, it registers the `dependency_up` metric, which reads from the mocked `dependencyHealth`.
- `src/infrastructure/observability/metrics-registry.ts`: provides `getPrometheusMetrics()`, which produces the text output the assertions check.

## Notes
- The assertions are substring matches on the Prometheus text output, not on structured metric objects.
- "Disabled" means the dependency is not configured, which the tests treat as a supported deployment. The series is omitted rather than reported as 0, so the alert can't fire for it.
- Each test sets its own mock return value, so a test depends on its own `mockReturnValue` call and not on shared state.
