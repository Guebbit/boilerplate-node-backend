# src/infrastructure/observability/analytics/none.ts

## Purpose

A no-op analytics provider selected via `NODE_ANALYTICS_PROVIDER=none`. It makes "this deployment collects no product analytics" an explicit, stated choice rather than a silent side effect of leaving credentials blank. Unlike the other providers (which warn when selected but unconfigured), this one is intentionally silent because collecting nothing is its entire purpose.

## Key elements

- **`noneAnalyticsProvider`** (exported constant) — the sole export; an object conforming to the `AnalyticsProvider` type.
  - `name: 'none'` — provider identifier.
  - `capture()` — deliberately empty; discards all analytics events.
  - `configured()` — always returns `true`, because "collecting nothing" is the complete configuration; there is no unconfigured state to warn about.
  - `shutdown()` — returns an already-resolved promise; no resources to release.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — provides the `AnalyticsProvider` type that this file implements. The index module is the registry/entry point that likely reads `NODE_ANALYTICS_PROVIDER` and returns the appropriate provider instance (including this one when the value is `"none"`).

## Notes

- `configured()` unconditionally returning `true` is a deliberate design decision, not an oversight. It prevents startup warnings that would be misleading since there is nothing to configure.
- All three methods are trivially safe to call in any order or frequency; there is no internal state.
