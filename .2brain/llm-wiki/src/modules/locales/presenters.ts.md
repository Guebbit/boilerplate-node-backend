---
source: src/modules/locales/presenters.ts
sha256: 82f931482ad6b795230ee77f18f962d9ce05386d6f945f20bf72c4855addc6ae
generated_at: 2026-11-08T06:23:50.743810+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/presenters.ts

## Purpose

Provides the single-document wire-shape transform for locale entries. Because the repository's `search()` path already returns `LocaleEntry` directly and languages merge both tiers without needing a separate presenter, this module exists solely to give single-document write flows (create/update) a stored-document → wire-shape cast.

## Key elements

- **`presentLocaleEntry(document: LocaleEntryDocument): LocaleEntry`** — Calls the model's `toJSON()` (which renames `_id` → `id` and serializes dates to ISO strings) and casts the result to `LocaleEntry`. The cast is necessary because `toJSON()` is untyped relative to the wire contract.

## Relationships

- **`./model.ts`** — Supplies the `LocaleEntryDocument` type that this file accepts; the document's `toJSON()` implementation performs the actual field renaming and date serialization.
- **`@types` (`src/types/index.ts`)** — Supplies the `LocaleEntry` type that this file returns; the presenter is the bridge between the stored document shape and this wire shape.
- **`controllers/post-locale-entry.ts` / `controllers/put-locale-entry.ts`** — The write-path controllers that need a single-document presentation after persisting; they consume `presentLocaleEntry` to hand a correctly-shaped `LocaleEntry` to the HTTP response.
- **`controllers/get-locale-entries.ts`** — Does **not** consume this presenter; its `search()` call already yields `LocaleEntry` via the repository's lean transform.

## Notes

- The module doc explicitly states that a language does **not** need a presenter here — `localeService.describeStoredLanguage` handles that merge. Do not add a language variant.
- The `as LocaleEntry` cast is load-bearing: `toJSON()` is not typed as `LocaleEntry`, so removing it (or the underlying `toJSON` contract) will break the return type silently.
