---
source: src/infrastructure/observability/analytics/none.ts
source_sha256: efb7c3a34941d2e1f98481767bd8ab679776ed02c56b3cabba12eb620b3745e6
context_sha256: 3e639389d7858e4a842186d163d8417cfc14cc0e71c85bed73af2746dfe54abf
generated_at: 2026-11-22T02:57:19.763694+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/analytics/none.ts

## Purpose
The no-op analytics provider. Selected with `NODE_ANALYTICS_PROVIDER=none`, it makes "collects nothing" an explicit choice rather than a side effect of blank credentials. The other two providers warn when selected but unconfigured, because that state is almost always an accident. This one stays silent because nothing is misconfigured.

## Key elements
- `noneAnalyticsProvider`: the only export. It is an `AnalyticsProvider` object with `name: 'none'`.
  - `capture()`: empty, does nothing.
  - `forget()`: resolves immediately, since nothing was collected and there is nothing to erase.
  - `configured()`: always returns `true`, because collecting nothing is this provider's whole configuration.
  - `shutdown()`: resolves immediately.

## Relationships
- Imports the `AnalyticsProvider` type from `./index` (`src/infrastructure/observability/analytics/index.ts`), which defines the port this object implements. The import is type-only.

## Notes
- The file doesn't show how `NODE_ANALYTICS_PROVIDER` is read or how this provider is chosen. That logic is outside this file.
- Because `configured()` is always `true`, callers that warn on `configured() === false` will never warn for this provider.
