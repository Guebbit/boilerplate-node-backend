---
source: src/infrastructure/observability/analytics/none.ts
sha256: 8dd2ec50b5ae2ba25cdd99114665eff1b1d8e4e77500545989e8fb592aa56b14
generated_at: 2026-09-23T17:47:52.969620+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/none.ts

## Purpose

A no-op analytics provider that implements the `AnalyticsProvider` port by doing nothing. It exists so that opting out of analytics collection is an explicit, stated choice (via `NODE_ANALYTICS_PROVIDER=none`) rather than a side effect of missing credentials or an unconfigured provider.

## Key elements

- **`noneAnalyticsProvider`** (exported const) — the only export; a plain object satisfying the `AnalyticsProvider` type.
    - `name` — the literal string `'none'`, used as the provider identifier.
    - `capture()` — deliberately empty; performs no work.
    - `configured()` — always returns `true`, because "collect nothing" _is_ the configuration; there is no unconfigured state for this provider.
    - `shutdown()` — returns an already-resolved `Promise<void>`; no cleanup is needed.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — imports the `AnalyticsProvider` type from this module. The `noneAnalyticsProvider` object is typed against that interface, which is defined (or re-exported) in `index.ts`.

## Notes

- Unlike the other two analytics providers (which warn at startup when selected but unconfigured), this provider is intentionally silent. The distinction is deliberate: an empty config on the real providers is almost always an accident, whereas choosing `'none'` is not.
- There is no runtime branching or conditional logic here; the object is a static, stateless literal.
