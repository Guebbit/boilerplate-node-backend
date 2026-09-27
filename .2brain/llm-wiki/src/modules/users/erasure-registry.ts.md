---
source: src/modules/users/erasure-registry.ts
sha256: 4c325e25444cb93058cffcde0b21ef1df0e2cb8d9f86a67bc09cb98ee7c0fa7e
generated_at: 2026-09-27T15:37:05.065812+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/erasure-registry.ts

## Purpose

Holds the `users` module's view of the DDD-D6 `personalData.erase` registry. Because `users` cannot import sibling modules under `src/modules/*` to collect their manifest entries itself (the same circular-dependency wall that motivates `@modules/account/services/personal-data-registry.ts`), the list is **supplied in once at boot** by the `onRegistered` hook rather than assembled here.

## Key elements

- **`PersonalDataEraser`** (type, not exported) — signature for one module's erase hook: `(userId: string, session: ClientSession) => Promise<void>`.
- **`erasers`** (module-level `let`) — the current readonly list of erasers; empty until the app tier supplies them.
- **`setPersonalDataErasers(registered)`** (exported) — replaces the entire list. Called once at boot by `module.ts`; tests call it to install a fixture and to restore the empty default.
- **`personalDataErasers()`** (exported) — getter returning the current list in declaration order.

## Relationships

- **`src/modules/users/module.ts`** — Its `onRegistered` hook calls `resolvePersonalDataErasers(modules)` once every enabled module is known, then hands the result to `setPersonalDataErasers` in this file.
- **`src/modules/users/service.ts`** — Consumes `personalDataErasers()` to iterate and invoke each eraser when performing a user-data erasure.
- **`src/modules/users/tests/integration/service.test.ts`** — Calls `setPersonalDataErasers` to install a test fixture before exercising the service, and again with an empty array to restore the default state.

## Notes

- The list is **replaced wholesale** on each `setPersonalDataErasers` call; there is no append/remove API. Order of the returned array reflects the order in which modules registered their erasers.
- The variable is `let` (reassignable) but the public surface only exposes a `readonly` tuple, so consumers cannot mutate the array in place.
- This file intentionally contains no logic beyond the getter/setter pair — all resolution happens in `module.ts`.
