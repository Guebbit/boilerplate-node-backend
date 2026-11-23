---
source: src/modules/account/services/personal-data-registry.ts
source_sha256: 5c12f8b13f13d4ce9ee85ab43b798ef689705d9db55f557047944d54752d9555
context_sha256: c26083c93300e1fe0acbafd3600c48b8bb4928b4e4bbf43085b98e92dce0e51c
generated_at: 2026-11-22T03:39:47.427693+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/personal-data-registry.ts

## Purpose
Holds the list of `personalData` sections that the `account` module knows about. The list is not built here: `account` can't import `src/modules/*` to collect each module's manifest entry, so the list is supplied once at boot and stored in module-level state.

## Key elements
- `sections` (private): module-level `readonly PersonalDataSection[]`, initially empty.
- `setPersonalDataSections(registered)`: replaces the stored list. Called once at boot, and by tests to install a fixture and to restore an empty list afterwards.
- `personalDataSections()`: returns the stored sections in declaration order.

## Relationships
- `src/kernel/registry.ts`: provides the `PersonalDataSection` type (type-only import).
- `src/modules/account/module.ts`: its `onRegistered` hook builds the list with `resolvePersonalDataSections(modules)`, once every enabled module is known, and passes it to `setPersonalDataSections`.
- `src/modules/account/services/export-job.ts` and `src/modules/account/tests/integration/export.test.ts`: neighbors in the dependency graph. The file's content shows only that tests call `setPersonalDataSections`, not how these two files use it.

## Notes
- Until `setPersonalDataSections` is called, `personalDataSections()` returns an empty array.
- Each call to `setPersonalDataSections` replaces the whole list, so nothing is merged.
- The state is a module-level singleton, so tests that install a fixture should reset it afterwards.
- This follows the same pattern as `src/modules/locales/services/translatables.ts`, which works around the same import restriction.
