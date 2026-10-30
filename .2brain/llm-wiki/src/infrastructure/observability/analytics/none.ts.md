---
source: src/infrastructure/observability/analytics/none.ts
sha256: 08b0d82b04a9b6537ccd1ad6faccfb689230f0cf6f75cb80681ac97c7885db95
generated_at: 2026-10-29T02:08:16.310768+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/none.ts

## Purpose

Provides the no-op `AnalyticsProvider` implementation, selected via `NODE_ANALYTICS_PROVIDER=none`. It exists to make "collects nothing" an explicit, stated configuration choice rather than an accidental side effect of blank credentials (which the other providers treat as a misconfiguration and warn about).

## Key elements

- **`noneAnalyticsProvider`** — the sole export; satisfies the `AnalyticsProvider` port with empty behavior:
  - `name` — the string `'none'`.
  - `capture()` — deliberately empty; records nothing.
  - `forget()` — resolves immediately; no data held, so nothing to erase.
  - `configured()` — always returns `true`; "collecting nothing" *is* this provider's entire configuration.
  - `shutdown()` — resolves immediately; nothing to tear down.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — imports the `AnalyticsProvider` type from this file; the index module (which performs provider selection based on `NODE_ANALYTICS_PROVIDER`) exports `noneAnalyticsProvider` as one of the selectable options.

## Notes

- `configured()` unconditionally returns `true`. This is intentional: the other two providers use `configured()` to detect an "accidentally blank credentials" state and emit a warning. The none-provider must never trigger that path, since its silence *is* the configured state.
- See `docs/tools/analytics.md` for the broader provider-selection documentation.
