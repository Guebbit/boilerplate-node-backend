---
source: scripts/contracts/personal-data-assembly.ts
generated_at: 2026-11-22T01:59:23.420710+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/personal-data-assembly.ts

## Purpose
Builds the schema of the `POST /account/export` response from what each module declares about its own section. Modules list their contributions under an `x-personal-data` key in their own `openapi.yaml`. This file adds one property per declared section to the `AccountExportResponse` stub in the `account` module's staged OpenAPI file. Removing a module therefore removes its section, and no hand-maintained list is needed. The logic is pure (text and declarations in, text out), and the caller owns disk access.

## Key elements
- `PersonalDataSection` (interface): one declared section, with `module`, `key` (the property name), `required`, and `schema` (`$ref`s still relative to the declaring module's file).
- `readPersonalDataSections(modulesRoot, modules)`: reads each module's `openapi.yaml` via `readModuleFragment` and returns its `x-personal-data` entries as sections, in the order of `modules`. It skips modules with no `openapi.yaml`. `required` defaults to `true`. Each schema is passed through `retarget`.
- `assemblePersonalData(ownerText, sections)`: parses the owner's YAML and finds `components.schemas.AccountExportResponse`. It adds each section to `properties`, and to `required` when the section is required. It returns the YAML re-serialized with `lineWidth: 0` and `indent: 4`. It throws if the stub is missing, if it lacks `properties` or `required`, or if two sections share a key.
- `stageExportSchema(stagedModulesRoot, modulesRoot, modules)`: the entry point the OpenAPI bundler calls. It rewrites `account/openapi.yaml` in the staged `src/modules` tree in place, using sections read from the real modules. It does nothing if the staged tree has no `account/openapi.yaml`.
- `retarget` (private): rewrites in-file `$ref`s (`#/...`) to `../<module>/openapi.yaml#/...` so they still resolve from the owner's document. Cross-file refs are left unchanged.
- `EXPORT_OWNER` (`'account'`) and `EXPORT_SCHEMA` (`'AccountExportResponse'`): constants naming the stub.

## Relationships
- `./fragments`: supplies `readModuleFragment`, used to read and parse each module's fragment.
- `openapi-bundle.ts`: the caller. Its bundling step calls `stageExportSchema` on the staged copy of the module tree.
- `tests/unit/scripts/contracts/personal-data-assembly.test.ts`: unit tests for this module.

## Notes
- Declarations are read straight from disk rather than through `redocly bundle`. Bundling follows only `$ref` chains and cannot see a top-level key that nothing points at.
- Cross-file `$ref`s are not rewritten. This relies on every fragment sitting at the same directory depth.
- Duplicate-key detection compares against the stub's existing `properties` too, so a section cannot overwrite `exportedAt` or `profile`.
- Section order in the output follows the `modules` order.
