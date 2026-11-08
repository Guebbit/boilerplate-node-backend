---
source: src/modules/observability/tests/unit/dependency-up.test.ts
sha256: 524e9b38596d367fd3813499b55501e6dea8a0380e3948cd6fef816eff45e62d
generated_at: 2026-11-08T06:42:35.646884+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/dependency-up.test.ts

## Purpose

Unit test for the `dependency_up` Prometheus metric. It verifies that the readiness-vocabulary → `1` / `0` / absent mapping rendered by the metric is correct, because the `DependencyUnavailable` alert fires on exactly this mapping.

## Key elements

- **`reading(overrides)`** – helper that returns a full `DependencyHealth` object with all three dependencies (`database`, `cache`, `queue`) set to `'ready'`, then applies per-case overrides. Keeps each test focused on the one state under examination.
- **`describe('dependency_up')`** – four test cases covering the full state→value contract:
  - All ready → each dependency renders as `1`.
  - `unavailable` → renders as `0` (the alert-firing condition).
  - `connecting` → renders as `0` (not yet serving).
  - `disabled` → the metric line for that dependency is **absent** entirely (supported deployment mode, not an error).
- **`jest.mock('../../services/dependency-health', …)`** – replaces the real health service with a jest mock so tests control the state without touching any infrastructure.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** – provides `getPrometheusMetrics()`, which the tests call to obtain the rendered Prometheus text that is then asserted against.
- **`src/modules/observability/metrics.ts`** – imported purely for side-effect: it registers the `dependency_up` metric with the registry so `getPrometheusMetrics()` includes it.
- **`src/modules/observability/services/dependency-health.ts`** – the source of the `DependencyHealth` type and the `dependencyHealth` service under test; mocked at module level so no real I/O occurs.

## Notes

- Assertions are made against the **rendered Prometheus exposition text** (e.g. `'dependency_up{dependency="database"} 1'`), not against structured metric objects. The test therefore implicitly validates label formatting and value precision.
- The `disabled` case asserts the label string is *not* present at all (`not.toContain('dependency="queue"')`), distinguishing "not configured" from "configured but down."
- The side-effect import of `../../metrics` must be retained; removing it would unregister the metric and make all assertions fail silently with empty output.
