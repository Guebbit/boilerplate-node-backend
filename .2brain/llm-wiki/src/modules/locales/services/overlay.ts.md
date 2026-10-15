---
source: src/modules/locales/services/overlay.ts
sha256: 4b49c9600cc40898f13596913ce4445b64d95dd000cab1fa14c71b1f367e0196
generated_at: 2026-10-15T10:46:29.737213+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/overlay.ts

## Purpose
Single-purpose wrapper module that ensures the i18n overlay is re-read after any write that may have changed locale overrides. It exists so that write paths in `entries.ts` and `languages.ts` call one stable entry point (`refreshOverlay`) rather than each remembering to invoke the infrastructure refresh directly.

## Key elements
- **`refreshOverlay(): void`** – The sole export. Fire-and-forget wrapper around `refreshLocaleOverrides()` from `@infrastructure/i18n`. Makes the edit immediately visible on the worker that served the write; other workers catch up on their next scheduled refresh.

## Relationships
- **`src/infrastructure/i18n/index.ts`** – Imports `refreshLocaleOverrides`, the function actually executed inside `refreshOverlay`.
- **`src/infrastructure/i18n/overrides.ts`** – Likely home of the `refreshLocaleOverrides` implementation (re-reads the API's own overrides from the database).
- **`src/modules/locales/services/entries.ts`** – Calls `refreshOverlay` after its write paths complete.
- **`src/modules/locales/services/languages.ts`** – Calls `refreshOverlay` after its write paths complete.

## Notes
- `refreshOverlay` is also invoked on **frontend-app** writes, even though those writes cannot affect the overlay. The trade-off is deliberate: calling it unconditionally is cheaper than threading the app identifier through every call site to conditionally skip it.
- The refresh is fire-and-forget; it does not block the response. Consumers should not await or chain further logic off of it.
