---
source: src/modules/account/services/personal-data-registry.ts
sha256: 5c12f8b13f13d4ce9ee85ab43b798ef689705d9db55f557047944d54752d9555
generated_at: 2026-09-27T14:30:07.210403+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/personal-data-registry.ts

## Purpose

A module-scoped, in-memory store for the list of `PersonalDataSection` entries. It exists because the `account` module cannot import sibling modules to collect their manifest entries (the same isolation wall that constrains `@modules/locales/services/translatables.ts`), so the sections must be supplied from outside once the full set of enabled modules is known.

## Key elements

- **`setPersonalDataSections(registered: readonly PersonalDataSection[]): void`** – Replaces the internal section list. Called once during boot; tests also call it to install fixtures and to reset to an empty list.
- **`personalDataSections(): readonly PersonalDataSection[]`** – Returns the current list of registered sections in declaration order.
- **`sections`** (module-private) – The backing array; empty until `setPersonalDataSections` is called.
- **`PersonalDataSection`** (imported type) – The shape of each section, defined in the kernel.

## Relationships

- **`src/kernel/registry.ts`** – Source of the `PersonalDataSection` type used as the element type of the stored list.
- **`src/modules/account/module.ts`** – Its `onRegistered` hook resolves the section list from all enabled modules (via `resolvePersonalDataSections`) and calls `setPersonalDataSections` to populate this registry.

## Notes

- This file **never** assembles or discovers sections itself; it is purely a passive holder. If the list is empty, the app tier hasn't supplied it yet (or a test reset it).
- `setPersonalDataSections` is **idempotent by replacement**—calling it a second time overwrites the previous list entirely, which is how tests swap fixtures in and out.
- The "once at boot" contract is enforced by convention and the caller in `module.ts`, not by any guard in this file.
