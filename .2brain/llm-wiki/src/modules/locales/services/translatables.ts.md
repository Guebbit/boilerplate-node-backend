---
source: src/modules/locales/services/translatables.ts
sha256: 19928b497cc295e5ecef7ccfe9bd203889b54ba096a7643e12d8bbec31e3002c
generated_at: 2026-09-23T18:52:35.437259+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/translatables.ts

## Purpose

Holds the process-wide mapping from entity type → `TranslatableTarget` and exposes a minimal getter. It exists as a thin injection point: the `locales` module is architecturally barred from importing other modules to collect manifests (the same circular-dependency wall that motivates the kernel translation port), so the app tier builds the complete lookup and hands it in at boot.

## Key elements

- **`translatables`** (module-private `let`) — the actual registry object; starts as `{}` and is replaced wholesale by `setTranslatables`.
- **`setTranslatables(registry)`** — injects (or replaces) the registry. Intended to be called exactly once at boot via `resolveTranslatables(enabledModules)` in `src/app.ts`; tests call it again to install or clear a fixture.
- **`translatableTarget(entityType)`** — returns the registered `TranslatableTarget` for a given entity type, or `undefined` if no module registered one.

## Relationships

- **`src/kernel/registry.ts`** — provides the `TranslatableTarget` type that this file imports and returns; this module is a consumer of that registry contract, not a definer of it.
- **`src/modules/locales/services/index.ts`** — barrel for the `locales/services` package; re-exports the two public functions (`setTranslatables`, `translatableTarget`) so callers address the service directory rather than this file directly.
- **`src/modules/locales/services/translations.ts`** — sibling service that resolves _where_ a translation is applied; it calls `translatableTarget(entityType)` to obtain the target, then performs the actual translation work.

## Notes

- The registry is **replace-only** (`setTranslatables` overwrites the reference). There is no per-key add/remove API by design: the app tier computes the full map in one shot.
- The registry is typed `Readonly<Record<…>>`, so consumers cannot mutate entries after injection.
- Because this file deliberately avoids importing `src/modules/*`, any new module that wants to be translatable must register its entry in the app-tier resolver, not here.
