---
source: scripts/contracts/root-assembly.ts
sha256: ced6d80864018448d5401d7333e7cc047d0607a2f79ab144a7b0de4de3a23864
generated_at: 2026-11-08T02:44:45.601314+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/root-assembly.ts

## Purpose

Assembles the root OpenAPI document by reconciling `shared/contracts/openapi.root.yaml` with whatever module fragments actually exist on disk. This is the mechanism behind "adding a module edits nothing outside its folder": the root's path index, tag list, and `x-tagGroups` are kept in sync automatically, so a new or deleted module requires zero manual edits to the root.

## Key elements

- **`ModuleFragment`** (interface) — the shape of what one module's `openapi.yaml` declares: `section`, `paths`, `tags`, optional `declaredTags`, optional `group`.
- **`pathRefFor(section, urlPath)`** — builds the relative `$ref` string the root uses to point at a module path item; applies JSON-Pointer escaping.
- **`assembleRoot(rootText, fragments)`** — main pure export. Parses the root YAML via `yaml`'s `Document` API, prunes stale path refs, appends missing paths/tags/tag-groups, and serialises back. Throws if the root lacks a `paths` map.
- **`readModuleFragments(modulesRoot, preferredOrder)`** — main I/O export. Discovers modules that ship an `openapi.yaml` (via `modulesWith`), orders them by narrative preference, and returns a `ModuleFragment` per module including its `group` from `module.yaml`.
- **`pruneStaleReferences`** — removes root path entries whose `$ref` no longer matches any fragment's declared path.
- **`appendMissingPaths`** — inserts a `$ref` entry for every fragment path the root doesn't yet reference.
- **`appendMissingTags`** — adds tags (with description when the fragment declares one) that fragments use but the root doesn't list yet.
- **`appendTagGroups`** / **`familyOfEachTag`** — maintains the `x-tagGroups` extension so docs renderers (Redoc, Scalar) show tag families rather than one flat list.
- **`groupOf`** — reads the `group` key from a module's `module.yaml` on disk.

## Relationships

- **`scripts/contracts/fragments.ts`** — source of `readModuleFragment`, `TAG_FAMILY_OF_GROUP`, and the `DeclaredTag` type; provides the per-module parse that feeds `ModuleFragment`.
- **`scripts/contracts/section-order.ts`** — provides `orderSections`, which orders the fragment list by the narrative preference in the root YAML (unknown modules appended alphabetically).
- **`scripts/modules-on-disk.ts`** — provides `modulesWith`, the folder-listing discovery that determines *which* modules have an `openapi.yaml`.
- **`scripts/contracts/openapi-bundle.ts`** — the caller that passes the assembled root text to `redocly bundle` and writes the final bundle.
- **`tests/unit/scripts/contracts/root-assembly.test.ts`** — unit tests for `assembleRoot` and `readModuleFragments`.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — verifies the end-to-end guarantee that adding a module folder requires no root edits.

## Notes

- `assembleRoot` is **pure** (text in → text out); all disk I/O lives in `readModuleFragments` and `groupOf`. The caller owns file writes.
- The root YAML's path list is a **preference**, not a registry. Membership is whatever the fragments declare on disk.
- Uses `yaml`'s `Document` API (`parseDocument`, `document.get`, `document.set`, `document.addIn`) to preserve comments, anchors, and key order. Output is serialised with `lineWidth: 0, indent: 4` (no line wrapping, 4-space indent).
- Tag description: the **first** fragment (in section order) to declare a tag name wins; later duplicates are ignored. Tag family: declared tags take precedence over used-only tags; `FALLBACK_FAMILY = 'Other'` catches the rest.
- `pruneStaleReferences` collects stale entries into an array **before** deleting, because `paths.items` is a live array the deletions would mutate during iteration.
- `PATH_REF` is a regex used only for *recognising* module `$ref` strings during pruning; the positive construction is `pathRefFor`.
