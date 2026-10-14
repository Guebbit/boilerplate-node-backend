---
source: scripts/contracts/root-assembly.ts
sha256: 3f745dfc0dc15483bb3d16426753d8fe26d2a21727c3cdea56d2918edea81f14
generated_at: 2026-10-14T07:12:25.600392+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/root-assembly.ts

## Purpose

Reconciles the root OpenAPI document (`shared/contracts/openapi.root.yaml`) against whatever module fragments actually exist on disk, so that adding or removing a module never requires editing the root file. It prunes `$ref` entries whose fragment path is gone and appends `$ref` entries and tag declarations for new ones.

## Key elements

- **`ModuleFragment`** — interface describing one module's contract surface: `section`, `paths`, `tags`, optional `declaredTags`.
- **`DeclaredTag`** — a single entry from a fragment's top-level `tags:` list (`name`, optional `description`).
- **`pathRefFor(section, urlPath)`** — builds the `../../src/modules/<section>/openapi.yaml#/paths/<pointer>` `$ref` string (JSON-Pointer-escaped).
- **`assembleRoot(rootText, fragments)`** — pure entry point: parses the root YAML with the `yaml` Document API, calls `pruneStaleReferences`, `appendMissingPaths`, `appendMissingTags`, then serialises. Returns the reconciled YAML string ready for `redocly bundle`. Throws if the root lacks a `paths` map.
- **`readModuleFragments(modulesRoot, preferredOrder)`** — discovers module directories on disk (a folder containing `openapi.yaml` qualifies), orders them via `orderSections`, reads each fragment's `paths` keys, operation `tags`, and top-level `tags` declarations. Returns `ModuleFragment[]`.
- **`pruneStaleReferences`** (internal) — removes `paths` entries whose `$ref` no longer matches any fragment declaration; returns the set of surviving refs.
- **`appendMissingPaths`** (internal) — adds `$ref` entries for fragment paths the root does not yet reference.
- **`appendMissingTags`** (internal) — merges fragment-declared tags (first-writer-wins for descriptions) and used-but-undeclared tag names into the root's `tags` list.
- **`PATH_REF`** / **`encodePointer`** — regex and helper for matching/producing the `$ref` format.

## Relationships

- **`scripts/contracts/section-order.ts`** — imports `orderSections` to order fragments by the preferred narrative list, appending unlisted modules alphabetically.
- **`scripts/contracts/openapi-bundle.ts`** — the downstream consumer: calls `readModuleFragments` + `assembleRoot` and hands the result to `redocly bundle`.
- **`tests/unit/scripts/contracts/root-assembly.test.ts`** — unit tests for `assembleRoot` and `readModuleFragments`.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — integration-level test verifying the "new module folder is sufficient" invariant.

## Notes

- The function is **pure** with respect to disk I/O in `assembleRoot`: it takes and returns strings. Only `readModuleFragments` touches `node:fs`. The caller owns file writes.
- Uses the `yaml` package's `Document` node API (not `parse` to plain objects) specifically to preserve comments, anchors, and key order in the root file. Serialisation uses `lineWidth: 0` (no wrapping) and `indent: 4`.
- The root's `paths` list is a **preference order**, not a registry. Membership is determined entirely by which fragments exist on disk. Entries for vanished paths are silently dropped.
- Tag description conflicts: the first fragment (in section order) that declares a tag name provides the description; later duplicates are ignored.
- `PATH_REF` expects exactly two leading `../` segments, matching the root's location in `shared/contracts/`. A different directory layout would break matching.
