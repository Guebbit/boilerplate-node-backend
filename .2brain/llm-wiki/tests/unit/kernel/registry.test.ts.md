---
source: tests/unit/kernel/registry.test.ts
sha256: 75713a5e74b1ae260567c6ace86e6f44a0c1190c5d01cbbdf1b58d8f3ae86b09
generated_at: 2026-11-08T10:28:00.537226+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/registry.test.ts

## Purpose

Unit tests for every public function exported by `@kernel/registry`. They verify the boot-time flattening and validation contract: each resolver produces a correct lookup or array from an `AppModule[]`, and duplicate-key resolvers throw rather than silently overwrite. The file deliberately omits dependency-graph assertions (cycles, `dependsOn`, unknown modules) because those are enforced by each module's `module.yaml` and `.dependency-cruiser.cjs`, not by the registry at boot.

## Key elements

- **`registerModules` tests** — asserts `subscribe` is called once per module that declares it, and that a module without `subscribe` is a valid no-op, not an error.
- **`resolveTranslatables` tests** — verifies flattening into a single `{ entityType → TranslatableTarget }` map; empty object when no module declares one; throws (matching the entity-type name) when two modules claim the same `entityType`.
- **`resolvePersonalDataSections` tests** — verifies flattening into a flat array in declaration order; `'none'` contributes nothing; a single module may contribute multiple sections; all-`none` yields `[]`.
- **`resolvePersonalDataMinimisers` tests** — verifies that only sections declaring a `minimise` hook are collected, in order, while sections without one are skipped.
- **`resolvePublicEvents` tests** — verifies flattening into a `{ eventName → { toPublicEvent } }` map; empty object when absent; throws (matching the event name) on duplicate domain-event claims.
- **`resolveBrowserEvents` tests** — verifies flattening into a `{ eventName → handler }` map; modules without `browserEvents` are skipped; throws on duplicate browser-event names.

## Relationships

- **`src/kernel/registry.ts`** — the sole import target. All tested functions (`registerModules`, `resolveTranslatables`, `resolvePersonalDataSections`, `resolvePersonalDataMinimisers`, `resolvePublicEvents`, `resolveBrowserEvents`) and the `AppModule` type are imported from it.
- `tests/cross-cutting/translatable-targets.test.ts` — referenced in a comment; owns the cross-cutting check that a translatable entry names real collections/fields (out of scope here).
- `tests/cross-cutting/webhook-event-producers.test.ts` — referenced in a comment; owns the cross-cutting check that a `publicEvents` projection matches a currently-firing domain event.

## Notes

- Duplicate-key detection is **boot-time (throw)**, not silent last-writer-wins, for the three keyed resolvers (`resolveTranslatables`, `resolvePublicEvents`, `resolveBrowserEvents`). The array-based resolvers (`resolvePersonalDataSections`, `resolvePersonalDataMinimisers`) have no key to collide and therefore no duplicate guard.
- Every `AppModule` fixture in this file must include `personalData` (either `'none'` or an array) — it is a required field on the type, not optional in practice.
- The file intentionally does **not** test `dependsOn` resolution, cycle detection, or unknown-dependency errors; those live in the dependency-cruiser config and per-module `module.yaml`, per the file's top-level comment.
