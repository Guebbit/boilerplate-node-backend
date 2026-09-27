---
source: src/modules/locales/services/overlay.ts
sha256: e06cad591ff60df4d280e9953946a16ae684a110faa8a5076148f2ae4cd01519
generated_at: 2026-09-27T15:01:42.663128+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/overlay.ts

## Purpose

A single-purpose wrapper that triggers a database overlay refresh after any write that may have changed locale overrides. By centralising the refresh call here, every write path in `entries.ts` and `languages.ts` picks it up by construction, so a future write path can't silently forget the refresh.

## Key elements

- **`refreshOverlay(): void`** — The sole export. Calls `refreshLocaleOverrides()` (imported from `@infrastructure/i18n`) and discards the result. Fire-and-forget: the calling worker sees the edit immediately; other workers pick it up on their next scheduled refresh.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Source of the `refreshLocaleOverrides` import (re-exported from the i18n infrastructure module).
- **`src/infrastructure/i18n/overrides.ts`** — Underlying implementation of the override refresh logic that `refreshLocaleOverrides` delegates to.
- **`src/modules/locales/services/entries.ts`** — Calls `refreshOverlay()` at the end of its write paths.
- **`src/modules/locales/services/languages.ts`** — Calls `refreshOverlay()` at the end of its write paths.

## Notes

- `refreshOverlay` intentionally fires for frontend-tenant writes as well, even though those writes cannot affect the overlay. The rationale (stated in the file comment) is that threading a tenant check through every call site is more cost than the wasted call.
- The function is `void` and never awaited at call sites; it is a side-effect trigger, not a data-returning operation.
