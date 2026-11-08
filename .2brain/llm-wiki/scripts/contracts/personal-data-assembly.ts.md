---
source: scripts/contracts/personal-data-assembly.ts
sha256: 7f2b6b7ca2652bac1db9086ab679afe53c099c23c04a207452f7d1972b0412ba
generated_at: 2026-11-08T02:43:56.670894+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/personal-data-assembly.ts

## Purpose

Assembles the `POST /account/export` response schema by collecting `x-personal-data` declarations from each contributing module's `openapi.yaml` and merging them into the `account` module's `AccountExportResponse` stub. This eliminates a hand-maintained list of export sections: adding or removing a module automatically adds or removes its section.

## Key elements

- **`PersonalDataSection`** (interface) — Describes one declared export section: owning module, property key, required flag, and schema (with `$ref`s still relative to the declaring module).
- **`retarget`** (internal) — Recursively rewrites in-file `$ref`s (`#/…`) to `../<module>/openapi.yaml#/…` so references resolve correctly after the schema is copied into the owner's document. Cross-file relative refs are left untouched (all fragments share the same directory depth).
- **`readPersonalDataSections`** — Reads each module's `openapi.yaml` from disk (via `readModuleFragment`), extracts its `x-personal-data` map, and returns a flat array of `PersonalDataSection` in the order of the supplied `modules` list. Skips modules that have no `openapi.yaml`.
- **`assemblePersonalData`** — Parses the owner's YAML text, locates the `AccountExportResponse` stub, and inserts one property (plus a `required` entry if applicable) per section. Throws on duplicate keys or a missing/malformed stub. Returns the serialized YAML string.
- **`stageExportSchema`** — The single entry point called by the bundler. Reads declarations from the **real** `src/modules` tree, rewrites the **staged** copy of `account/openapi.yaml` in place. No-ops if the staged owner file doesn't exist.

## Relationships

- **`scripts/contracts/fragments.ts`** — Provides `readModuleFragment`, which this file uses to parse a module's `openapi.yaml` into a plain object.
- **`scripts/contracts/openapi-bundle.ts`** — The caller of `stageExportSchema`; this file is the one contract-assembly step the bundler invokes.
- **`tests/unit/scripts/contracts/personal-data-assembly.test.ts`** — Unit tests covering section reading, ref retargeting, stub assembly, and duplicate-key errors.

## Notes

- Reads declarations directly from disk rather than through `redocly bundle`, because the bundler only follows `$ref` chains and cannot surface a top-level key that nothing references (same reason error codes are collected this way).
- `required` defaults to `true` when a module omits the field in its `x-personal-data` entry.
- Output YAML is serialized with `lineWidth: 0, indent: 4` to keep the staged file diff-friendly.
- The function is intentionally pure (`assemblePersonalData` takes/returns strings); `stageExportSchema` is the thin I/O wrapper.
