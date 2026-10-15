---
source: src/modules/locales/services/translatables.ts
sha256: fc8d1faea22654ad641bb2403770b1f487fa72068fe2601af123c7c930b4772b
generated_at: 2026-10-15T10:46:38.529270+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/translatables.ts

## Purpose

Holds a single in-memory lookup table that maps an `entityType` string to its `TranslatableTarget` descriptor. It exists because the `locales` module cannot import other feature modules to discover their translatable manifests (circular-dependency constraint); instead the app tier assembles the full registry at boot and injects it here via a one-time setter.

## Key elements

- **`setTranslatables(registry)`** — Module-level setter. Replaces the internal `translatables` record. Called once during boot (via `../module.ts`'s `onRegistered` hook after `resolveTranslatables(modules)` runs); tests call it again to install/restore fixtures.
- **`translatableTarget(entityType)`** — Getter. Returns the registered `TranslatableTarget` for the given key, or `undefined` if the key was never registered. Uses `Object.hasOwn` to restrict lookup to own properties, guarding against prototype-pollution lookups (e.g. `"constructor"` arriving from a URL parameter).
- **`translatables`** (module-local, not exported) — The backing `Readonly<Record<string, TranslatableTarget | undefined>>`, initialized to an empty object until `setTranslatables` is called.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `TranslatableTarget` type used as the value type of the registry.
- **`src/modules/locales/services/index.ts`** — Re-exports this module's public API (`setTranslatables`, `translatableTarget`) so consumers import from the services barrel rather than the file directly.
- **`src/modules/locales/services/translations.ts`** — Sibling service that likely calls `translatableTarget` to resolve the target descriptor before performing the actual translation lookup.

## Notes

- The registry is **injected, never self-assembled**. If a new module is added but its translatable manifest is not picked up by the boot hook, `translatableTarget` will silently return `undefined`—there is no error or warning path.
- `entityType` values are treated as opaque strings (originating from URLs). The `Object.hasOwn` guard is load-bearing; do not replace it with a plain `in` or bracket lookup.
- The record is typed `Readonly` externally, but `setTranslatables` accepts any `Readonly` record—mutating the object *after* injection is possible at the call-site and would not be caught by the type system here.
