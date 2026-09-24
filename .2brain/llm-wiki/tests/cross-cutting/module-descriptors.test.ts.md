---
source: tests/cross-cutting/module-descriptors.test.ts
sha256: 45a6671865ae3951b97f65fc9b17d6a8057bd1e24ad343140b575f6357a181d8
generated_at: 2026-09-23T19:57:01.876917+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/module-descriptors.test.ts

## Purpose

Validates that every module's `module.yaml` descriptor is well-formed and internally consistent. It is the "hygiene" counterpart to `.dependency-cruiser.cjs` (which fails closed on bad descriptors): this test catches the bad descriptor itself—missing file, unparseable YAML, self-reference, phantom sibling, duplicate, or unsorted edge list—before anything trusts the data.

## Key elements

- **`MODULES_ROOT`** — Resolved path to `src/modules`; the single source of truth for which modules exist.
- **`moduleNames`** — Directory listing of `MODULES_ROOT` (read from disk, not a registry), filtered to directories and sorted. Drives the `describe.each` block.
- **`describe.each(moduleNames)`** — One test group per module folder. Each group runs three assertions:
    - _exists_ — `module.yaml` is present on disk.
    - _parses against the strict schema_ — `readModuleDescriptor` returns without throwing.
    - _structural invariants on `dependsOn`_ — no self-reference, every entry is a real sibling module name, no duplicates, list is in alphabetical order.

## Relationships

- **`scripts/docs/module-descriptor.ts`** — Imported for `readModuleDescriptor`. Used in two roles: (1) as a strict-schema validator (must not throw) and (2) as the source of the `dependsOn` array for the structural checks. If the descriptor parser's schema changes, this test breaks or silently passes—keep them in sync.

## Notes

- Module names are read **from the filesystem**, not from any in-code registry. A descriptor is required for every directory under `src/modules` regardless of whether the module is "enabled" at runtime.
- The tests use `Array.prototype.toSorted()` (non-mutating) rather than `sort()`, implying a Node ≥ 20 / ES2023 target.
- The alphabetical-order assertion is a _convention enforced by test_, not a requirement of `readModuleDescriptor` itself; the parser does not re-order the list.
