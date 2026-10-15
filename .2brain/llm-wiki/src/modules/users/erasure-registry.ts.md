---
source: src/modules/users/erasure-registry.ts
sha256: efbf6b6766b1b276a84140f30046861031b6cdf3d6975f4c2e696f3bdce8ab57
generated_at: 2026-10-15T12:07:39.794615+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/erasure-registry.ts

## Purpose

Holds the module-local lists of personal-data erasers and minimisers that the `users` module operates on. Because `users` cannot import from other `src/modules/*` packages (circular-dependency wall), this file acts as a passive registry: it stores whatever list the app tier injects at boot and exposes it to in-module consumers. It does not assemble, resolve, or own the eraser definitions itself.

## Key elements

- **`setPersonalDataErasers(registered: readonly PersonalDataEraser[])`** — Replaces the stored eraser list. Called once at boot by `module.ts`; re-called in tests to swap in fixtures or reset.
- **`personalDataErasers(): readonly PersonalDataEraser[]`** — Returns the current eraser list in declaration order. Empty until the setter has been called.
- **`setPersonalDataMinimisers(registered: readonly PersonalDataMinimiser[])`** — Same pattern for minimisers.
- **`personalDataMinimisers(): readonly PersonalDataMinimiser[]`** — Returns the current minimiser list.
- **`erasers` / `minimisers`** (module-level, non-exported) — The mutable backing arrays; start as `[]`.
- **Types imported from `@kernel/registry`** — `PersonalDataEraser`, `PersonalDataMinimiser` (type-only).

## Relationships

- **`src/kernel/registry.ts`** — Source of the `PersonalDataEraser` and `PersonalDataMinimiser` types consumed here.
- **`src/modules/users/module.ts`** — Calls `setPersonalDataErasers` (and likely `setPersonalDataMinimisers`) inside its `onRegistered` hook, passing the resolved list produced by `resolvePersonalDataErasers(modules)`. This is the single injection point at boot.
- **`src/modules/users/services/reaper.ts`** / **`src/modules/users/services/remove.ts`** — In-module consumers that read `personalDataErasers()` / `personalDataMinimisers()` to know which erasers/minimisers to invoke during user-removal flows.
- **`src/modules/users/tests/integration/erasure-roles.test.ts`** / **`service.test.ts`** — Call the setters to install fixture erasers/minimisers, then restore the empty list in teardown.

## Notes

- The lists are **replace-on-write**: calling a setter discards any previous list entirely. There is no append or merge.
- Order is preserved as given by the caller ("declaration order"); this file does not sort or filter.
- Until the setter is called (e.g., if a service is exercised in isolation without boot), the getters return an **empty array**—not `undefined`. Guard accordingly if you assume at least one entry.
- The design mirrors `@modules/account/services/personal-data-registry.ts`; the same circular-import constraint that necessitated that file is why this one exists rather than a static import of every module's manifest.
