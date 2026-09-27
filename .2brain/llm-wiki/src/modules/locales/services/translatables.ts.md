---
source: src/modules/locales/services/translatables.ts
sha256: 4d4e10b2c2c86f9a232b50b2f788ec327fdda8fa77aef5152249932973d915b9
generated_at: 2026-09-27T15:01:52.751987+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/translatables.ts

## Purpose

Holds a process-wide, mutable lookup from `entityType` to a `TranslatableTarget`, populated once at boot and read throughout the `locales` services. It exists because `locales` cannot import from `src/modules/*` to gather each module's manifest entry (the same circular-dependency wall the `kernel/translation` port works around), so the registry is assembled externally and injected here.

## Key elements

- **`translatables`** (module-level `let`) — the actual `Record<string, TranslatableTarget | undefined>` map; starts empty.
- **`setTranslatables(registry)`** — replaces the entire registry in one shot. Called once at boot (via `../module.ts`'s `onRegistered` hook) and again by tests to install/restore fixtures. No merging logic.
- **`translatableTarget(entityType)`** — reads a single entry by `entityType`; returns `undefined` if nothing was registered for that type.

## Relationships

- **`src/kernel/registry.ts`** — source of the `TranslatableTarget` type imported here; defines the shape each registry value must conform to.
- **`src/modules/locales/services/index.ts`** — barrel for the `services` subdirectory; re-exports this module so consumers import from the services index rather than a deep path.
- **`src/modules/locales/services/translations.ts`** — sibling service that consumes `translatableTarget()` to resolve which target a given `entityType` should be translated into.

## Notes

- The registry is **empty by default**. Calling `translatableTarget()` before the boot hook runs (e.g., in an isolated unit test that forgets to call `setTranslatables`) silently returns `undefined` for every key — there is no guard or warning.
- `setTranslatables` **replaces** the map wholesale; there is no incremental registration or merge API. If multiple modules contribute entries, the caller must pre-assemble the full object (as `resolveTranslatables(modules)` does).
- The value type uses `| undefined` in the `Record` signature, meaning a key can be present but mapped to `undefined` — distinct from a missing key, though `translatableTarget()` treats both identically.
