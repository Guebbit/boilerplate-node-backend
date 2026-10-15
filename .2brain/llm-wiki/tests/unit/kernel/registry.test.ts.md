---
source: tests/unit/kernel/registry.test.ts
sha256: 8298cb4bf1b268e22a16535ca1a3ffab438f1f94f38524ae1aa8ede3a6d00b8a
generated_at: 2026-10-15T13:22:50.941768+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/registry.test.ts

## Purpose

Unit tests for the boot-time resolution functions exported by `@kernel/registry`. Verifies the contract of each resolver (what it returns, what it throws on) using inline `AppModule` fixtures — no integration with real module definitions or the filesystem.

## Key elements

- **`registerModules` tests** — asserts that `subscribe` is invoked exactly once per module that declares it, and that a module with no `subscribe` is silently skipped (not an error).
- **`describe('resolveTranslatables')`** — verifies the flat lookup keyed by `entityType`, the empty-object case, and the duplicate-`entityType` throw (message includes the key in quotes).
- **`describe('resolvePersonalDataSections')`** — verifies the flat array in declaration order, `'none'` contributing nothing, multiple sections from one module all appearing.
- **`describe('resolvePersonalDataMinimisers')`** — verifies only sections that declare a `minimise` hook are collected, in order.
- **`describe('resolvePublicEvents')`** — verifies the flat lookup keyed by domain-event name, the empty-object case, and the duplicate-event-name throw.
- **`describe('resolveBrowserEvents')`** — verifies the flat lookup keyed by browser-event name (identity check via `toBe`), and the duplicate-name throw with a descriptive message.

## Relationships

- **`src/kernel/registry.ts`** — the sole dependency. All imports (`registerModules`, `resolveTranslatables`, `resolvePersonalDataSections`, `resolvePersonalDataMinimisers`, `resolvePublicEvents`, `resolveBrowserEvents`, `type AppModule`) come from this module. The tests exercise its public API exclusively; no other file is imported.

## Notes

- The file explicitly documents (via doc comments) what it does **not** assert: dependency-graph validation (`dependsOn`, cycles) is enforced by `.dependency-cruiser.cjs` and per-module `module.yaml`, not at boot. Cross-cutting correctness (e.g. that a translatable target names a real collection) lives in `tests/cross-cutting/translatable-targets.test.ts` and `tests/cross-cutting/webhook-event-producers.test.ts`.
- Duplicate-key collisions (translatables, public events, browser events) are hard throws, not "last one wins" — the tests assert the error message contains the offending key.
- `personalData: 'none'` is a sentinel string meaning "contributes nothing" to both sections and minimisers; it is not an empty array.
- No `jest.config` or setup file is imported; the file assumes Jest globals (`it`, `describe`, `expect`, `jest.fn`).
