---
source: src/modules/locales/services/translatables.ts
sha256: 48f9bc4d125a5588aa0a1894e63151348c1b2771921a045a01677f99ba665db3
generated_at: 2026-11-08T06:26:37.426019+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/translatables.ts

## Purpose

Holds the app-wide translatable-target lookup (entityType → target) for the locales module. The registry is supplied externally at boot because `locales` cannot import from `src/modules/*` to collect each module's manifest entry — the same circular-dependency wall that motivates `kernel/translation.ts`'s translation port.

## Key elements

- **`setTranslatables(registry)`** — Replaces the module-level `translatables` record with the supplied lookup. Called once at boot (by `../module.ts`'s `onRegistered` hook, which builds the lookup via `resolveTranslatables(modules)`); tests also call it to install/restore fixtures.
- **`translatableTarget(entityType)`** — Returns the registered `TranslatableTarget` for a single entity type, or `undefined`. Uses `Object.hasOwn` to guard against prototype-pollution lookups (e.g. `"constructor"` from a URL parameter).
- **`translatableCacheTags()`** — Returns a deduplicated array of every `cacheTag` value across all registered targets. Used to know which tags a language on/off/away event must clear so cached responses carrying old stored text are invalidated.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `TranslatableTarget` type imported here; the shape of each entry in the registry.
- **`src/modules/locales/services/index.ts`** — Service barrel that re-exports this module so consumers can import from the locales services entry point.
- **`src/modules/locales/services/languages.ts`** — Consumes `translatableCacheTags()` (or the target lookup) when a language is toggled or removed, to clear the right cache tags.
- **`src/modules/locales/services/translations.ts`** — Consumes `translatableTarget()` to resolve where a translation write should land; relies on the registry being populated before any translation operations.

## Notes

- The registry is **write-once by design** in production. Calling `setTranslatables` after boot replaces the entire map; there is no per-entry `add`/`remove` API.
- `translatables` starts as an empty object. Any read before `setTranslatables` is called (e.g. in a unit test that forgets to seed) silently returns `undefined` / `[]` rather than throwing.
- The `Object.hasOwn` check in `translatableTarget` is intentional security hardening — `entityType` is sourced from URLs and would otherwise hit inherited properties like `constructor`.
