---
source: tests/unit/kernel/registry.test.ts
sha256: e72cc97e01667867dbf3ce3a0c1fc543df01d8ccd538661219796030ff46d53a
generated_at: 2026-09-27T16:11:59.213545+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/registry.test.ts

## Purpose

Unit tests for the four boot-time resolution functions exported by `@kernel/registry`. Each test verifies the structural contract (flattening, ordering, duplicate rejection) of one function in isolation, without exercising runtime behavior like actual DB writes or event emission.

## Key elements

- **`registerModules` tests** — Asserts that `subscribe` is called exactly once per module that declares it, and that a module omitting `subscribe` is a valid no-op (not an error).
- **`resolveTranslatables` tests** — Verifies that per-module `translatables` maps are merged into a single object keyed by `entityType`; returns `{}` when no module declares any; throws (with the colliding key in the message) when two modules claim the same `entityType`.
- **`resolvePersonalDataSections` tests** — Verifies that per-module `personalData` arrays are concatenated into one flat array in declaration order; `'none'` contributes nothing; a single module may contribute multiple sections.
- **`resolvePublicEvents` tests** — Same pattern as translatables but keyed by domain-event name (e.g. `'order.created'`); throws on duplicate event registration.

## Relationships

- **`src/kernel/registry.ts`** — The module under test. This file imports `registerModules`, `resolveTranslatables`, `resolvePersonalDataSections`, `resolvePublicEvents`, and the `AppModule` type from it, and asserts on their return values / thrown errors.

## Notes

- The file deliberately does **not** test dependency-cycle detection, unknown-dependency resolution, or duplicate-module-name guards. Those concerns live in `.dependency-cruiser.cjs` and in each module's `module.yaml`, not in the runtime `registerModules` path.
- Cross-cutting validation (e.g. that a translatable target names a real collection, or that a public event actually fires) is delegated to `tests/cross-cutting/translatable-targets.test.ts` and `tests/cross-cutting/webhook-event-producers.test.ts` respectively.
- Duplicate-key rejection for both `resolveTranslatables` and `resolvePublicEvents` asserts that the thrown message includes the offending key (regex match on the stringified key), ensuring the error is actionable.
