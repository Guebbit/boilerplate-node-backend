---
source: src/modules/observability/tests/unit/dependency-up.test.ts
sha256: 524e9b38596d367fd3813499b55501e6dea8a0380e3948cd6fef816eff45e62d
generated_at: 2026-10-15T10:57:03.893108+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/dependency-up.test.ts

## Purpose

Unit test for the `dependency_up` Prometheus metric. It locks in the exact mapping from `DependencyHealth` states to metric values (1 / 0 / label-absent) that the `DependencyUnavailable` alert depends on, with all real dependency checks mocked out.

## Key elements

- **`reading(overrides)`** – helper that returns a `DependencyHealth` object with every dependency set to `'ready'`, then applies per-case overrides.
- **`mockedDependencyHealth`** – the jest-mocked `dependencyHealth` service; each test sets its return value to control the dependency states under test.
- **`describe('dependency_up')`** – four cases:
  - All ready → `dependency_up{…} 1` for each dependency.
  - One `unavailable` → that dependency reports `0`.
  - One `connecting` → that dependency reports `0` (not yet serving).
  - One `disabled` → the label is **absent** from the output entirely (not `0`).

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** – supplies `getPrometheusMetrics()`, the scrape entry point the tests call to capture rendered metric text.
- **`src/modules/observability/metrics.ts`** – imported for side effect only; it registers the `dependency_up` metric with the registry so it appears in the scrape output.
- **`src/modules/observability/services/dependency-health.ts`** – provides the `DependencyHealth` type and the `dependencyHealth` function, which is fully mocked here so no real I/O occurs.

## Notes

- The `import '../../metrics'` line has no binding; it exists purely to trigger metric registration as a side effect.
- The "disabled" case asserts the label string is **not present at all** (`not.toContain('dependency="queue"')`), distinguishing "absent" from "set to 0." This is the critical contract: a disabled dependency must not fire the alert, and omitting it achieves that.
- `connecting` maps to `0` (same as `unavailable`), meaning a dependency still in a startup window will trip the alert. If that's undesirable, the mapping in `metrics.ts` would need to change.
