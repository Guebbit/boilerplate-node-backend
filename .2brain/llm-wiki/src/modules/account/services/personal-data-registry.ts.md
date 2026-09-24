---
source: src/modules/account/services/personal-data-registry.ts
sha256: 33d95d5749684de50e3effe49ca81f6c29c117b3384f988a0242d0570cac385b
generated_at: 2026-09-23T18:09:18.039875+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/personal-data-registry.ts

## Purpose

Holds the list of `PersonalDataSection` entries for the account module. Because `account` cannot import sibling modules to collect their manifest entries (the same circular-dependency wall as `@modules/locales/services/translatables.ts`), the app tier assembles the list externally and injects it here at boot. This file is a passive store, never an assembler.

## Key elements

- **`sections`** (module-private) — `readonly PersonalDataSection[]`, initialized to `[]`. Replaced wholesale by the setter.
- **`setPersonalDataSections(registered)`** — Replaces the stored list with the supplied one. Called once at boot; tests call it to install a fixture and again to restore `[]`.
- **`personalDataSections()`** — Returns the current list in declaration order.

## Relationships

- **`src/app.ts`** — The sole producer. Calls `resolvePersonalDataSections(enabledModules)` and hands the result to `setPersonalDataSections`. This is the one direction data crosses into the account module.
- **`src/kernel/registry.ts`** — Source of the `PersonalDataSection` type imported here.
- **`src/modules/account/module.ts`** — Module registration surface; this service lives under the account module's service tree.
- **`src/modules/account/services/export.ts`** — Consumes `personalDataSections()` to build export payloads.

## Notes

- `setPersonalDataSections` **replaces** the list; it does not merge or append. Calling it twice overwrites the first call entirely.
- The module deliberately has no import of `src/modules/*`. Any code that needs the sections should call `personalDataSections()`, never re-derive them.
- Tests are expected to call `setPersonalDataSections([])` in teardown to avoid leaking fixtures between test cases.
