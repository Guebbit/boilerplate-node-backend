---
source: src/modules/locales/services/translatables.ts
sha256: 48f9bc4d125a5588aa0a1894e63151348c1b2771921a045a01677f99ba665db3
generated_at: 2026-10-29T04:24:40.619127+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/translatables.ts

## Purpose

Holds a process-wide, read-only lookup of translatable targets (entity type → target descriptor). The map is **not** built here: `locales` cannot import other modules' manifests (the same circularity wall the kernel translation port avoids), so an app-tier hook (`onRegistered` in `../module.ts`) assembles the lookup via `resolveTranslatables(modules)` once all enabled modules are known, then injects it here at boot.

## Key elements

- **`translatables`** (module-private `let`) — the single mutable cell backing the registry; starts as `{}` and is replaced atomically.
- **`setTranslatables(registry)`** — replaces the entire lookup. Called once at boot; tests call it again to install a fixture and to restore `{}` in teardown.
- **`translatableTarget(entityType)`** — returns the `TranslatableTarget` registered for that entity type, or `undefined`. Uses `Object.hasOwn` rather than a plain property read to guard against inherited keys (e.g. `"constructor"`) that could arrive from a URL parameter.
- **`translatableCacheTags()`** — returns a de-duplicated array of every `cacheTag` present in the current registry. Callers use it to know which HTTP-cache tags must be invalidated when a language is toggled or removed.

## Relationships

- **`src/kernel/registry.ts`** — provides the `TranslatableTarget` type imported here; also the source of the `resolveTranslatables` helper used by the boot-time caller.
- **`src/modules/locales/services/index.ts`** — barrel for the `locales` service; re-exports this module's public API so consumers can import from a single path.
- **`src/modules/locales/services/translations.ts`** — the translation-fetch/cache layer that consumes `translatableTarget` and `translatableCacheTags` to decide what to store and which tags to clear.
- **`src/modules/locales/services/languages.ts`** — language enable/disable logic that triggers cache-tag invalidation via `translatableCacheTags`.

## Notes

- The registry is **replaced wholesale**, never mutated in place. This means concurrent reads during a replace see either the old or the new map—no partial state.
- `translatableTarget` intentionally checks own-properties only; a plain `translatables[entityType]` would leak the prototype chain. This matters because `entityType` is user-supplied (URL segment).
- `translatableCacheTags` skips `undefined` entries in the map, so unregistered entity types contribute nothing.
- The module is a `@module` (no named export for the module itself); all public surface is the three exported functions.
