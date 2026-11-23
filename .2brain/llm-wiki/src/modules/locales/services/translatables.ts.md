---
source: src/modules/locales/services/translatables.ts
source_sha256: 48f9bc4d125a5588aa0a1894e63151348c1b2771921a045a01677f99ba665db3
context_sha256: 584bac966ffac0ddcc0dd57bd7b00997ddf7ff9e20f2f63b91f7d4ea7bab2e6d
generated_at: 2026-11-22T05:48:32.877700+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/services/translatables.ts

## Purpose
Holds the `translatables` registry as seen by the `locales` module: a lookup from `entityType` to its `TranslatableTarget`. The module never builds it. `locales` cannot import `src/modules/*`, so the module's `onRegistered` hook builds the lookup with `resolveTranslatables(modules)` once all enabled modules are known and passes it in here.

## Key elements
- `setTranslatables(registry)`: replaces the module-level registry. It is called once at boot. Tests call it to install a fixture and to restore an empty one.
- `translatableTarget(entityType)`: returns the declared `TranslatableTarget` for an `entityType`, or `undefined` if nothing registered it.
- `translatableCacheTags()`: returns every distinct `cacheTag` across the registered targets, deduplicated with a `Set`. A translation write clears these tags. A language being switched on or off, or removed, must clear them too, because that changes which stored text cached responses may carry.

## Relationships
- `src/kernel/registry.ts`: provides the `TranslatableTarget` type, which is imported as a type only.
- `src/modules/locales/services/index.ts`, `src/modules/locales/services/languages.ts` and `src/modules/locales/services/translations.ts` are neighbors in the dependency graph. The file's own content does not show how they use it. The doc comments suggest that language changes and translation writes are the consumers of `translatableCacheTags`, and `translatableTarget` is probably used by the translation services, but this is not confirmed here.

## Notes
- The registry starts empty (`{}`), so every lookup returns `undefined` until `setTranslatables` is called.
- `translatableTarget` uses `Object.hasOwn` because `entityType` comes from the URL. Without it, inherited names such as `constructor` would resolve to a value.
- The registry is mutable module-level state, so the last call to `setTranslatables` wins.
- Registry values may be `undefined`. `translatableCacheTags` skips them.
