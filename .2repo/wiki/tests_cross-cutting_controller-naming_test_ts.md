# tests/cross-cutting/controller-naming.test.ts

## Purpose

Enforces that every controller file in `src/modules/*/controllers/` is named `<verb>-<thing>.ts` (verb ∈ `get|post|put|patch|delete|write`). It exists so that no controller can be added under a resource-form or arbitrary name without immediately failing CI, and so the convention is guarded mechanically rather than by memory.

## Key elements

- **`CONTROLLER_FILENAME`** – Regex `^(get|post|put|patch|delete|write)-[\da-z-]+\.ts$` that defines the only legal controller filename shape.
- **`listControllers()`** – Walks `src/modules/*/controllers/` at runtime and returns every `.ts` file it finds. Discovery-based: new domains are covered automatically.
- **`describe('controller filenames')`** – Two assertions:
  - *Canary*: controller count must exceed 30, preventing an empty sweep from passing vacuously.
  - *Rule*: every discovered filename must match `CONTROLLER_FILENAME`; any offender is reported.
- **`MODULES_ROOT`** – Resolved relative to the test file as `src/modules`.

## Notes

- There is deliberately **no allowlist or exclusion list**. The file's docstring records the rejection of a second legal naming form and treats any future allowlist as a regression to folklore.
- `write-` is accepted as a verb prefix because it pairs `create` (POST) with `update` (PUT/PATCH) in the same file.
- The test reads the filesystem at `describe` time (not per-test), so it will fail loudly if `src/modules` is missing or empty rather than silently passing.
- Because it is a cross-cutting test, it lives under `tests/cross-cutting/` rather than next to any specific module.
