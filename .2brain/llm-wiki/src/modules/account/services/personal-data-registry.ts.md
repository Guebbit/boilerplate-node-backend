---
source: src/modules/account/services/personal-data-registry.ts
sha256: 5c12f8b13f13d4ce9ee85ab43b798ef689705d9db55f557047944d54752d9555
generated_at: 2026-11-08T04:20:43.463660+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/personal-data-registry.ts

## Purpose

Holds the in-memory list of `PersonalDataSection` entries that the account module exposes for personal-data export. It exists because `account` cannot import other `src/modules/*` packages to gather their manifests itself (the same circular-import wall that constrains `@modules/locales/services/translatables.ts`). The list is therefore supplied from outside once, at boot, rather than assembled here.

## Key elements

- **`sections`** — module-level `readonly PersonalDataSection[]`, initialised to `[]`. Never exposed directly; all access goes through the two exported functions.
- **`setPersonalDataSections(registered)`** — Replaces the current list. Called once during the module's `onRegistered` boot hook; also re-invoked by tests to install a fixture and to reset to `[]` afterwards.
- **`personalDataSections()`** — Getter returning the current list in declaration order.

## Relationships

- **`src/kernel/registry.ts`** — Source of the `PersonalDataSection` type imported here (type-only import).
- **`src/modules/account/module.ts`** — Boot caller. Its `onRegistered` hook calls `resolvePersonalDataSections(modules)` (defined elsewhere in the account module) and passes the result to `setPersonalDataSections`, populating the registry once every enabled module is known.
- **`src/modules/account/services/export-job.ts`** — Consumes `personalDataSections()` to determine which sections to include when building an export job.
- **`src/modules/account/tests/integration/export.test.ts`** — Calls `setPersonalDataSections` to install a test fixture and then resets the list to `[]` in teardown.

## Notes

- The list is **replace-only**: there is no append/remove API. Treat `setPersonalDataSections` as a one-shot assignment, not a collection mutation.
- The initial value is always `[]`. Any code that reads `personalDataSections()` before the boot hook fires (or before a test fixture is set) will see an empty array — no error is thrown.
- The type is `readonly` throughout; callers must not mutate the returned array.
