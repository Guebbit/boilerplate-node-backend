---
source: src/infrastructure/observability/analytics/none.ts
sha256: 08b0d82b04a9b6537ccd1ad6faccfb689230f0cf6f75cb80681ac97c7885db95
generated_at: 2026-11-08T03:38:15.133989+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/analytics/none.ts

## Purpose

A no-op analytics provider that satisfies the `AnalyticsProvider` port while performing no actual tracking. It exists so that opting out of analytics is an explicit, stated configuration choice (`NODE_ANALYTICS_PROVIDER=none`) rather than a silent side effect of missing credentials.

## Key elements

- **`noneAnalyticsProvider`** (`AnalyticsProvider`) — the sole export. Implements every method on the port as a no-op:
  - `capture()` — empty body; does nothing.
  - `forget()` — resolves immediately (no data to erase).
  - `configured()` — always returns `true` (collecting nothing *is* the only configuration).
  - `shutdown()` — resolves immediately.

## Relationships

- **`src/infrastructure/observability/analytics/index.ts`** — imports the `AnalyticsProvider` type definition from this file. The `index.ts` file presumably re-exports or selects `noneAnalyticsProvider` when the `NODE_ANALYTICS_PROVIDER` env var is set to `"none"`.

## Notes

- Unlike the other two providers in this module, `noneAnalyticsProvider` intentionally emits **no warning** when selected. The doc comment explains the rationale: the other providers warn because an unconfigured state is usually accidental, whereas selecting `none` is a deliberate decision.
- `configured()` returning `true` unconditionally means health-check or startup logic that gates on this method will never treat this provider as misconfigured.
- `forget()` and `shutdown()` still return `Promise<void>` (not `void`) to satisfy the async interface contract; they simply resolve synchronously.
