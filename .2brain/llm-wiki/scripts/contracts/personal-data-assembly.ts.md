---
source: scripts/contracts/personal-data-assembly.ts
sha256: 49d06a38c7509fcb81d58b452d2bab97739e11eda53eb71a2646c61c7823b9a5
generated_at: 2026-10-15T09:38:50.985152+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/personal-data-assembly.ts

## Purpose

Assembles the `POST /account/export` response schema by collecting `x-personal-data` declarations from each module's `openapi.yaml` and injecting them as properties into the `AccountExportResponse` stub in the `account` module. Adding or removing a module automatically adds or removes its export section—no central list to maintain.

## Key elements

- **`EXPORT_OWNER`** (`'account'`) — identifies the module that owns the export endpoint and the stub being completed.
- **`PersonalDataSection`** (interface) — one section declaration: owning module, property key, `required` flag, and the (possibly re-targeted) schema.
- **`retarget`** (internal) — walks a schema node and rewrites in-file `$ref`s (`#/…`) to point at the declaring module's `openapi.yaml`. Cross-file relative refs are left untouched (all fragments sit at the same depth).
- **`readPersonalDataSections(modulesRoot, modules)`** — reads each module's `openapi.yaml` from disk via `readModuleFragment`, extracts the `x-personal-data` map, and returns an ordered array of `PersonalDataSection`.
- **`assemblePersonalData(ownerText, sections)`** — pure function: parses the owner's YAML, inserts each section as a property (and into `required` if applicable), and returns the serialized YAML. Throws on duplicate keys or a missing/malformed stub.
- **`stageExportSchema(stagedModulesRoot, modulesRoot, modules)`** — the single entry point the bundler calls. Reads the staged owner file, reads real module declarations, and writes the completed YAML back in place. Silently skips if the staged owner file does not exist.

## Relationships

- **`scripts/contracts/fragments.ts`** — imports `readModuleFragment` to parse a module's `openapi.yaml` into a JS object for the `x-personal-data` lookup.
- **`scripts/contracts/openapi-bundle.ts`** — calls `stageExportSchema` to complete the export stub before bundling the full OpenAPI document.
- **`tests/unit/scripts/contracts/personal-data-assembly.test.ts`** — unit-tests the read, retarget, assemble, and stage logic.

## Notes

- Declarations are read directly from disk rather than through `redocly bundle`, because the bundler only follows `$ref` chains and cannot see a top-level key nothing references.
- `required` defaults to `true` when a module omits it in its `x-personal-data` entry.
- `assemblePersonalData` is a pure text-in/text-out function; only `stageExportSchema` performs I/O.
- Output YAML is serialized with `lineWidth: 0` and `indent: 4`.
- All modules must use distinct section keys; a collision is a hard error.
