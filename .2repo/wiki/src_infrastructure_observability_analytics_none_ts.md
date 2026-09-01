# src/infrastructure/observability/analytics/none.ts

## Purpose

A no-op analytics provider that satisfies the `AnalyticsProvider` port while collecting nothing. It exists so that "no analytics" is an explicit, deliberate choice (`NODE_ANALYTICS_PROVIDER=none`) rather than a silent side effect of missing credentials. Unlike the other providers, it emits no warnings when selected because the empty state *is* the configuration.

## Key elements

- **`noneAnalyticsProvider`** (exported const) — The single export. An object conforming to the `AnalyticsProvider` interface with:
  - `name: 'none'` — identifier for selection/logging.
  - `capture()` — intentionally empty; records nothing.
  - `configured()` — always returns `true`; "collecting nothing" is considered a fully valid configuration.
  - `shutdown()` — resolves immediately with no cleanup.

## Relationships

- **`./index.ts`** — Provides the `AnalyticsProvider` type that this module implements. The index file is also the likely selection point that instantiates `noneAnalyticsProvider` when `NODE_ANALYTICS_PROVIDER` is set to `'none'`.

## Notes

- The file is marked `@module` — it has no default export; consumers must import the named `noneAnalyticsProvider` binding.
- Because `configured()` always returns `true`, any downstream logic that gates on configuration state will treat this provider as "ready" and never trigger unconfigured-warnings.
- Referenced documentation lives at `docs/tools/analytics.md` (path noted in the module JSDoc).
