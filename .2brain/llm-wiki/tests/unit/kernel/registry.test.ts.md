---
source: tests/unit/kernel/registry.test.ts
sha256: 379fdaa314df3d994178e63bad409c5e2915f06c9a4348ba3ba72ab46a5d35a2
generated_at: 2026-09-23T20:27:49.219207+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/registry.test.ts

## Purpose

Unit tests for the three public functions exported by `@kernel/registry` — `registerModules`, `resolveTranslatables`, and `resolvePersonalDataSections`. Each test focuses on the contract visible from the `AppModule` array input: what gets called, what gets flattened, and how the `'none'` sentinel is handled.

## Key elements

- **`registerModules` tests (top-level `it` blocks)**
    - Verifies that `subscribe` is invoked exactly once per module that declares one.
    - Verifies that a module with no `subscribe` is silently skipped (no throw, no error), and that a sibling module's `subscribe` is still called.

- **`resolveTranslatables` describe block**
    - Verifies that the per-module `translatables` maps are merged into a single flat lookup keyed by `entityType`.
    - Verifies that an empty result (`{}`) is returned when no module declares `translatables`.

- **`resolvePersonalDataSections` describe block**
    - Verifies that `personalData` arrays from multiple modules are concatenated in declaration order.
    - Verifies that `'none'` contributes no entry.
    - Verifies that a single module can contribute multiple `{ section, collect }` entries (all are kept, not just the first).

## Relationships

- **`src/kernel/registry.ts`** — the sole import target. This file exercises `registerModules`, `resolveTranslatables`, `resolvePersonalDataSections`, and the `AppModule` type definition exported from that module. No other source files are imported or touched.

## Notes

- The file deliberately does **not** test duplicate-name detection, unknown-dependency resolution, or cycle detection. The doc comment at the top states that `AppModule` carries no `dependsOn` field; dependency structure is enforced at the module's own `module.yaml` and by `.dependency-cruiser.cjs`, not by `registerModules` at boot.
- Validation that `translatables` entries reference real collections and fields is explicitly out of scope here and delegated to `tests/cross-cutting/translatable-targets.test.ts`.
- `personalData` is a discriminated union: the string `'none'` or an array of `{ section, collect }` objects. Tests exercise both branches.
