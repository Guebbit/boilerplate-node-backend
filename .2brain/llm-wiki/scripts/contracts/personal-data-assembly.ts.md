---
source: scripts/contracts/personal-data-assembly.ts
sha256: ba9d92307a6e1a0839687c5e270ff33a88c5d6bb8907e1b8eedb5828b5573e91
generated_at: 2026-10-14T07:11:46.066732+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/personal-data-assembly.ts

## Purpose

Assembles the `POST /account/export` response schema by collecting each module's `x-personal-data` declarations from their respective `openapi.yaml` files and merging them into the `account` module's `AccountExportResponse` stub. This keeps the export schema fully declarative: a module opts in by declaring a section, and removing a module automatically removes its section with no hand-maintained list.

## Key elements

- **`EXPORT_OWNER`** (`'account'`) / **`EXPORT_SCHEMA`** (`'AccountExportResponse'`) — identify the owner module and the stub schema being completed.
- **`PersonalDataSection`** (interface) — one declared section: `module`, `key`, `required`, `schema` (with `$ref`s already retargeted).
- **`retarget(node, module)`** (private) — recursively rewrites in-file `$ref`s (`#/…`) to `../<module>/openapi.yaml#/…` so the schema still resolves after being copied into the owner's document. Cross-file refs are left untouched (all fragments share the same depth).
- **`readPersonalDataSections(modulesRoot, modules)`** — reads each module's `openapi.yaml` from disk, extracts `x-personal-data` entries, applies `retarget`, and returns a flat array in the order of `modules`. Skips modules whose file doesn't exist.
- **`assemblePersonalData(ownerText, sections)`** (pure) — parses the owner's YAML, injects one property per section into the stub's `properties` (and `required` where applicable), and serializes back. Throws on duplicate keys or a missing/malformed stub.
- **`stageExportSchema(stagedModulesRoot, modulesRoot, modules)`** — the single entry point the bundler calls: reads the staged owner file, reads declarations from the *real* modules, writes the assembled YAML back into the staged copy. No-ops if the staged owner file is absent.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — caller of `stageExportSchema`. This file is described in its own docs as "the one call the OpenAPI bundler makes."
- **`tests/unit/scripts/contracts/personal-data-assembly.test.ts`** — unit tests for the functions above.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — integration-level tests that exercise the bundling pipeline (including this assembly step) in a CI wave context.

## Notes

- Reading is done directly from disk (via the `yaml` library) rather than through `redocly bundle`, because `x-personal-data` is a top-level key that no `$ref` chain would surface.
- `assemblePersonalData` is pure (text in → text out); `stageExportSchema` is the only function that touches the filesystem for writing.
- `required` defaults to `true` when a module omits it.
- Output is serialized with `lineWidth: 0` (no wrapping) and 4-space indent.
- The module uses `parseDocument().toJS()` for *reading* (plain objects) but `parseDocument()` (node API) for *writing*, so it can use `createNode` and mutate the document tree in place.
