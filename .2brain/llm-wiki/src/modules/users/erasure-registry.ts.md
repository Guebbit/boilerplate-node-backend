---
source: src/modules/users/erasure-registry.ts
sha256: efbf6b6766b1b276a84140f30046861031b6cdf3d6975f4c2e696f3bdce8ab57
generated_at: 2026-11-08T08:45:36.088514+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/erasure-registry.ts

## Purpose

Holds the in-memory lists of `PersonalDataEraser` and `PersonalDataMinimiser` registrations that the `users` module uses at runtime. It exists because `users` cannot import sibling modules under `src/modules/*` to collect their manifest entries directly (circular-dependency wall); instead the lists are injected once at boot by the module registration hook.

## Key elements

- **`setPersonalDataErasers(registered)`** — Replaces the eraser list. Called once at boot; re-called by tests to install or clear fixtures.
- **`personalDataErasers()`** — Returns the current eraser list in declaration order (empty until set).
- **`setPersonalDataMinimisers(registered)`** — Replaces the minimiser list. Same boot/test lifecycle.
- **`personalDataMinimisers()`** — Returns the current minimiser list in declaration order (empty until set).
- Both lists are module-scoped `let` bindings; there is no per-module or per-request state.

## Relationships

- **`src/kernel/registry.ts`** — Source of the `PersonalDataEraser` and `PersonalDataMinimiser` types imported here.
- **`src/modules/users/module.ts`** — Its `onRegistered` hook calls `resolvePersonalDataErasers(modules)` (and the analogous minimiser resolver) and feeds the result into the setters in this file, once all enabled modules are known.
- **`src/modules/users/services/reaper.ts`** / **`src/modules/users/services/remove.ts`** — Downstream consumers that read the registered erasers/minimisers via the getter functions to perform personal-data erasure or removal.
- **`src/modules/users/tests/integration/erasure-roles.test.ts`** / **`service.test.ts`** — Integration tests that call the setters to install fixture lists and restore them to empty afterwards.

## Notes

- The lists are **empty by default**. Any code path that reads them before the boot-time injection will get `[]`. Tests must call the setter to populate them; forgetting this produces silent no-op behavior rather than an error.
- The setter **replaces** the entire list rather than appending, so order is determined by whatever array the caller passes (i.e., declaration order from the module resolution pass).
- The pattern mirrors `@modules/account/services/personal-data-registry.ts`, which solves the same circular-import constraint for the `account` module.
