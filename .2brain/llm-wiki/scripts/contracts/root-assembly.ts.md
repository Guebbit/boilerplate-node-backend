---
source: scripts/contracts/root-assembly.ts
sha256: 684ded7c6bc05b3deeab6ee530b4fefa77f8502dd9d5f3d8f43226acd846b86f
generated_at: 2026-11-14T17:29:06.222658+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/root-assembly.ts

## Purpose

Assembles the root OpenAPI document from the module fragments that exist on disk. Given the text of `shared/contracts/openapi.root.yaml` and the set of module fragments, it returns the completed YAML text ready for `redocly bundle`. It enforces the invariant that adding or removing a module requires no edit outside that module's folder: stale `$ref` entries are pruned, new ones appended, and the tag list is kept in sync automatically.

## Key elements

- **`ModuleFragment`** (interface) — the shape of what one module's `openapi.yaml` declares: its section name, declared paths, used tags, self-declared tags (with descriptions), and optional `group` family.
- **`assembleRoot(rootText, fragments)`** (export) — the main entry point. Parses the root with `yaml`'s `Document` API, prunes stale path refs, appends missing paths/tags/tag-groups, and serialises back. Throws if the root has no `paths` map.
- **`readModuleFragments(modulesRoot, preferredOrder)`** (export) — discovers which module folders ship an `openapi.yaml` (via `modulesWith`), orders them per the preferred list, and returns an array of `ModuleFragment`.
- **`pathRefFor(section, urlPath)`** (export) — builds the `$ref` string pointing into a module fragment's path item, with JSON Pointer escaping.
- **`pruneStaleReferences`** — removes root `paths` entries whose `$ref` no longer matches any fragment's declared path; returns the set of refs that survived.
- **`appendMissingPaths`** — adds a `$ref` node for every fragment path the root doesn't yet reference.
- **`appendMissingTags`** — ensures every used or declared tag appears in the root's `tags` list; first declaration wins for description.
- **`appendTagGroups`** / **`familyOfEachTag`** — assigns each tag to exactly one `x-tagGroups` family (for Redoc/Scalar renderers) based on which module declares it, its `x-family` override, or its `group`; unassigned tags fall into `"Other"`.
- **`groupOf`** — reads the `group:` key from a module's `module.yaml` (returns `undefined` if absent).

## Relationships

- **`scripts/contracts/fragments.ts`** — provides `readModuleFragment`, `TAG_FAMILY_OF_GROUP`, and the `DeclaredTag` type that this file consumes to interpret each module's fragment.
- **`scripts/contracts/section-order.ts`** — provides `orderSections`, used by `readModuleFragments` to sort discovered modules into the preferred narrative order.
- **`scripts/modules-on-disk.ts`** — provides `modulesWith`, the folder-listing discovery that determines which modules participate in the contract.
- **`scripts/contracts/openapi-bundle.ts`** — downstream consumer; receives the assembled YAML text to pass to `redocly bundle`.
- **`tests/unit/scripts/contracts/root-assembly.test.ts`** — direct unit tests for the assembly logic.
- **`tests/unit/scripts/contracts/analytics-browser-events.test.ts`** — verifies a specific module's fragment integrates correctly into the root.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — exercises the "add a module, edit nothing else" invariant this file implements.

## Notes

- **Pure vs. impure split:** `assembleRoot` is pure (string in → string out). `readModuleFragments` is the only function that touches the filesystem, keeping disk ownership with the caller.
- **Document API, not round-trip:** All edits go through `yaml`'s `Document` node API so comments, anchors, and key order in the root YAML survive the rewrite. Serialisation uses `lineWidth: 0` (no wrapping) and `indent: 4`.
- **Preference, not registry:** The root's `paths` and `tags` lists are only a *preference* for order. Actual membership is whatever the fragments declare on disk; the root is reconciled to match.
- **First-wins for tag description:** If two modules declare the same tag name, the first (in section order) provides the description; later ones are silently ignored. A tag that is only *used* (not declared) gets a bare `{ name }` entry.
- **JSON Pointer escape order:** `encodePointer` replaces `~` → `~0` *before* `/` → `~1`; reversing the order would corrupt the ref.
