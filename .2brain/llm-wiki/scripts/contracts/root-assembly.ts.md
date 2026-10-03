---
source: scripts/contracts/root-assembly.ts
sha256: fa0ebecc63c67bb0c1c32c04a98224d4dfae69945cfa68819ebeb7ea81943f57
generated_at: 2026-10-01T12:28:17.428073+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/root-assembly.ts

## Purpose

Reconciles the root OpenAPI document (`shared/contracts/openapi.root.yaml`) with the module fragments that exist on disk, so that adding or removing a module requires no manual edit outside that module's folder. It prunes stale `$ref` entries, appends new path refs and tags, and returns the corrected YAML text ready for `redocly bundle`.

## Key elements

- **`ModuleFragment`** (interface) — the per-module contract: `section` (folder name), `paths` (URL paths it declares), `tags` (tags its operations use).
- **`pathRefFor(section, urlPath)`** — builds the `$ref` string (`../../src/modules/<section>/openapi.yaml#/paths/<escaped>`) the root uses for one module path.
- **`assembleRoot(rootText, fragments)`** — main entry point. Parses the root YAML with the `yaml` Document API, then calls the three reconcilers below. Returns serialized YAML (`lineWidth: 0, indent: 4`). Throws if the root has no `paths` map.
- **`readModuleFragments(modulesRoot, preferredOrder)`** — discovers modules by directory listing (a folder containing `openapi.yaml` qualifies), reads each fragment, and returns `ModuleFragment[]` in the order dictated by `orderSections`.
- **`pruneStaleReferences`** (internal) — removes root `paths` entries whose `$ref` no longer matches any fragment's declared path. Collects stale keys first, then deletes, to avoid mutating the array mid-filter.
- **`appendMissingPaths`** (internal) — sets a `$ref` node in root `paths` for every fragment path not already present.
- **`appendMissingTags`** (internal) — appends bare `{ name }` entries to the root `tags` sequence for tags a fragment uses that the root does not yet list.
- **`encodePointer(segment)`** — JSON Pointer escaping (`~` → `~0` first, then `/` → `~1`).
- **`PATH_REF`** (regex) — matches the well-known `$ref` shape so the pruner can distinguish module refs from any other value.

## Relationships

- **`section-order.ts`** — provides `orderSections`, used by `readModuleFragments` to arrange fragments in the preferred narrative order (unknown sections fall back to alphabetical).
- **`openapi-bundle.ts`** — the bundling pipeline that calls `readModuleFragments` + `assembleRoot` to produce the final root document before handing it to `redocly bundle`.
- **`tests/unit/scripts/contracts/root-assembly.test.ts`** — unit tests covering `assembleRoot`, `pathRefFor`, and `readModuleFragments`.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — integration-style test asserting that dropping a new module folder into `src/modules` requires zero edits to the root file.

## Notes

- **Pure I/O boundary.** `assembleRoot` is a string-in / string-out function; the caller owns all disk access. This makes it trivially testable with scratch fixtures.
- **Document-level editing, not re-serialization.** Uses the `yaml` library's `Document` API so comments, anchors, and key order in the root file survive the round-trip. A plain `parse` → mutate object → `stringify` would lose them.
- **Preference ≠ registry.** The root's existing `paths` list and the `preferredOrder` array are ordering hints. Actual membership is determined solely by which `openapi.yaml` files exist on disk. A path in the root with no backing fragment is pruned; a fragment path not yet in the root is appended.
- **Escape order matters.** `encodePointer` must replace `~` before `/`; reversing the order corrupts pointers that contain a literal `~1`.
- **Stale-prune collect-then-delete.** `pruneStaleReferences` filters into a `stale` array first and deletes in a second loop, because `paths.items` is the live backing array that `delete` mutates.
