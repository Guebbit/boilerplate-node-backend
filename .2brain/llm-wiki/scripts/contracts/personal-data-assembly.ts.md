---
source: scripts/contracts/personal-data-assembly.ts
sha256: 7f2b6b7ca2652bac1db9086ab679afe53c099c23c04a207452f7d1972b0412ba
generated_at: 2026-10-29T01:31:46.197485+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/personal-data-assembly.ts

## Purpose

Collects `x-personal-data` section declarations from each module's `openapi.yaml` and merges them into the `account` module's `AccountExportResponse` stub, producing the full `POST /account/export` schema. Adding or removing a module's export section requires no manual list—only the module's own fragment changes.

## Key elements

- **`PersonalDataSection`** (exported interface) — one declared section: owning module, property key, required flag, and the schema (with `$ref`s retargeted to the declaring module's file).
- **`retarget`** (private) — recursively rewrites in-file `$ref` values (`#/…`) to `../<module>/openapi.yaml#/…` so refs still resolve after the schema is copied into the owner document. Cross-file relative refs are left untouched.
- **`readPersonalDataSections(modulesRoot, modules)`** (exported) — reads each module's fragment from disk via `readModuleFragment`, extracts `x-personal-data`, and returns an ordered array of `PersonalDataSection`. Skips modules with no `openapi.yaml`.
- **`assemblePersonalData(ownerText, sections)`** (exported, pure) — parses the owner YAML text, injects one property per section into `AccountExportResponse.properties`, appends required keys, and returns the serialized YAML. Throws on duplicate keys or a missing/malformed stub.
- **`stageExportSchema(stagedModulesRoot, modulesRoot, modules)`** (exported) — the single entry point the bundler calls. Reads the staged `account/openapi.yaml`, assembles, and writes the result back in place. No-ops if the staged owner file is absent.

## Relationships

- **`scripts/contracts/fragments.ts`** — provides `readModuleFragment`, used by `readPersonalDataSections` to load a module's `openapi.yaml` text from disk.
- **`scripts/contracts/openapi-bundle.ts`** — the caller that invokes `stageExportSchema` during the OpenAPI bundling pipeline, passing staged and real module roots plus the module list.
- **`tests/unit/scripts/contracts/personal-data-assembly.test.ts`** — unit tests covering `readPersonalDataSections`, `assemblePersonalData`, and the `retarget` behavior.

## Notes

- `assemblePersonalData` is pure (string in → string out); only `stageExportSchema` touches the filesystem. This separation keeps the core logic testable without disk fixtures.
- Sections are read directly from disk rather than via `redocly bundle` because the bundler only follows `$ref` chains and cannot surface a top-level key (`x-personal-data`) that nothing references.
- Section order in the output matches the order of the `modules` array passed by the caller; there is no alphabetical or dependency-based reordering.
- `retarget` assumes all fragments sit at the same directory depth under `src/modules`, so relative cross-file refs remain valid without rewriting.
- A duplicate `key` across modules is a hard error at assembly time, not a silent overwrite.
