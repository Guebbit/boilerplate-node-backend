---
source: tests/cross-cutting/personal-data-erasure.test.ts
sha256: c6446e025eeadda1df301b5a962975bc0974321648a55fdf48f8707104f7b8d4
generated_at: 2026-10-15T12:39:40.381124+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/personal-data-erasure.test.ts

## Purpose

Cross-cutting guard that every module whose `model.ts` references a `User` field declares a `personalData.erase` hook in its `module.ts` manifest. Catches the silent omission of an erasure hook (GDPR Art. 17) at the structural level without executing any module code.

## Key elements

- **`EXEMPT`** — `Record<string, string>` mapping module names to a justification string. Intentionally empty; entries may only be added with a reason.
- **`modulesHoldingUserRows`** — Sorted array of module directory names under `MODULES_ROOT` whose `model.ts` matches `/ref:\s*'User'/`. Computed once at module load via `readdirSync` + `readFileSync`.
- **`'finds the modules that hold rows about an account (the guard is not vacuous)'`** — Asserts the computed list includes `account`, `addresses`, `cart`, and `notifications` (filtered by `isDeployed`). Acts as a floor so a rename of the `User` ref fails the test rather than passing with an empty list.
- **`'%s declares an erase hook in its manifest'`** — Parameterised over every non-exempt entry in `modulesHoldingUserRows`; asserts the module's `module.ts` text contains both `personalData:` and `\berase:`.

## Relationships

- **`tests/support/paths.ts`** — Supplies `MODULES_ROOT` (the filesystem root scanned for module folders) and `isDeployed(name)` (used to conditionally include `cart` and `notifications` in the vacuity floor).

## Notes

- The file reads module sources **as plain text** (`readFileSync` + regex) rather than importing them. This is deliberate: a module that fails to load at runtime would otherwise drop out of the check silently instead of failing it.
- Detection of "holding user rows" is the single regex `/ref:\s*'User'/` against `model.ts`. Any change in how a module expresses that reference (e.g. a different field name or a re-export) will cause the module to disappear from the list and the vacuity test to catch the shift.
- `.toSorted()` is used (iterable protocol, ES2023) rather than `.sort()`.
- The erasure-hook assertion is a text match, not a structural or type-level check. It pins *presence* of the declaration, not its correctness; per-module tests are expected to verify the hook's behaviour.
