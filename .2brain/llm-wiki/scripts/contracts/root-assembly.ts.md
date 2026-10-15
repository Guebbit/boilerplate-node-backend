---
source: scripts/contracts/root-assembly.ts
sha256: 0167066a5f7adb569e0d030261d6f44672c456b26e0fa4502aa08d2057c12809
generated_at: 2026-10-15T09:39:04.232779+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/root-assembly.ts

## Purpose

Reconciles the root OpenAPI document (`shared/contracts/openapi.root.yaml`) with the set of module fragments present on disk. It prunes `$ref` entries whose module or path no longer exists, appends `$ref` entries for newly declared paths, and extends the root `tags` list with any tag a fragment uses or declares. This is the mechanism that makes "adding a module edits nothing outside its folder" true at the contract level.

## Key elements

- **`ModuleFragment`** (interface) — the shape of one module's contribution: `section`, `paths`, `tags`, and optional `declaredTags`.
- **`pathRefFor(section, urlPath)`** (exported) — builds the `$ref` string the root uses to point at a module's path item, applying JSON Pointer escaping.
- **`assembleRoot(rootText, fragments)`** (exported) — the main entry point. Parses the root YAML via the `yaml` Document API, prunes stale `$ref`s, appends missing path and tag entries, and returns the serialised YAML ready for `redocly bundle`. Throws if the root has no `paths` map.
- **`readModuleFragments(modulesRoot, preferredOrder)`** (exported) — discovers which module folders ship an `openapi.yaml`, orders them per the preferred narrative order (falling back to alphabetical), and reads each fragment into a `ModuleFragment[]`.
- **`pruneStaleReferences`** (internal) — removes root path entries whose `$ref` no longer matches any fragment declaration; returns the set of surviving refs.
- **`appendMissingPaths`** (internal) — adds a `{ $ref }` node for every fragment path the root does not yet reference.
- **`appendMissingTags`** (internal) — adds tag entries (with description if the fragment declares one, bare `{ name }` otherwise) for any tag used or declared by fragments but absent from the root.

## Relationships

- **`scripts/contracts/fragments.ts`** — imports `readModuleFragment` and the `DeclaredTag` type; the per-module fragment reader this module builds on.
- **`scripts/contracts/section-order.ts`** — imports `orderSections` to apply the preferred narrative ordering before fragment iteration.
- **`scripts/modules-on-disk.ts`** — imports `modulesWith` to discover which folders actually ship an `openapi.yaml`.
- **`scripts/contracts/openapi-bundle.ts`** — consumer of `assembleRoot`'s output; passes the assembled text to `redocly bundle`.
- **`tests/unit/scripts/contracts/root-assembly.test.ts`** — unit tests for this module's functions.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — integration-level test verifying the "new module, no external edits" guarantee this module provides.

## Notes

- The root YAML's path list is a **preference**, not a registry. Membership is determined entirely by what fragments declare on disk; the root file is edited in place (via the `yaml` Document API) to stay in sync.
- **JSON Pointer escaping order matters**: `~` → `~0` first, then `/` → `~1`. Reversing the order corrupts the pointer.
- `pruneStaleReferences` collects stale entries into an array *before* deleting, because `paths.items` is the live backing array — iterating and deleting in one pass would skip elements.
- Tag description conflict: the **first** fragment (in section order) to declare a tag name wins; later fragments repeating the same name are silently ignored.
- The function is pure with respect to I/O: `assembleRoot` takes text in, returns text out. The caller (`openapi-bundle.ts`) owns reading/writing files.
- Serialisation uses `lineWidth: 0, indent: 4` to match the project's existing YAML formatting.
