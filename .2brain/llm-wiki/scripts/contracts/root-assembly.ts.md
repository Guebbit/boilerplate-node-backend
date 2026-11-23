---
source: scripts/contracts/root-assembly.ts
generated_at: 2026-11-22T02:00:08.711722+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/root-assembly.ts

## Purpose
Completes the root OpenAPI document from what modules ship on disk. `shared/contracts/openapi.root.yaml` lists only paths no module owns. This file appends a `$ref` for every module path, declares missing tags, and builds `x-tagGroups`. As a result, adding a module edits nothing outside its own folder. The assembly is pure: it takes the root's text and the fragments and returns YAML text to bundle. The caller owns the disk.

## Key elements
- `ModuleFragment` (interface): one module's declarations: `section` (folder name), `paths`, `tags`, and optional `declaredTags` and `group` (from `module.yaml`).
- `pathRefFor(section, urlPath)`: builds `../../src/modules/<section>/openapi.yaml#/paths/<pointer>`, with the URL path JSON-Pointer-escaped (`~` → `~0`, then `/` → `~1`).
- `assembleRoot(rootText, fragments)`: the main entry point. It parses the root with `yaml`'s `parseDocument`, so comments, anchors and key order survive. It then runs three steps and serialises with `lineWidth: 0, indent: 4`. It throws if the root has no `paths` map or a path has two owners.
  - `appendModulePaths` adds a `$ref` per fragment path, in the order given, after the root's own paths. It throws if two modules, or a module and the root, claim the same URL.
  - `appendMissingTags` adds tags the root doesn't list. It uses the fragment's own description when the tag is declared, and a bare `{ name }` when it is only used. The first declaration in section order wins.
  - `appendTagGroups` places every tag in exactly one `x-tagGroups` family. Tags already in a group stay put. New families are appended in the order they are first met.
- `readModuleFragments(modulesRoot, preferredOrder)`: finds modules that ship `openapi.yaml`, orders them, and reads each into a `ModuleFragment`. It takes the paths, the tags used by operations, the declared tags, and the group.
- Internal helpers: `familyOfEachTag` decides each tag's family. `groupOf` reads `group` from a module's `module.yaml`.

## Relationships
- `section-order.ts`: `orderSections` sorts the discovered modules into the preferred narrative order.
- `modules-on-disk.ts`: `modulesWith(modulesRoot, 'openapi.yaml')` discovers which modules have a fragment.
- `fragments.ts`: provides `readModuleFragment` (parses a module's fragment file), the `DeclaredTag` type and `TAG_FAMILY_OF_GROUP` (maps a module group to a tag family).
- `openapi-bundle.ts`: not imported here. By the file's own docs, the YAML it returns is what gets handed to `redocly bundle`.
- Tests: `root-assembly.test.ts` is the direct test file. `analytics-browser-events.test.ts` and `new-module-needs-nothing.test.ts` are listed as graph neighbors.

## Notes
- A tag's family comes from the module that declares it first. That is the tag's `x-family`, else the module group's family via `TAG_FAMILY_OF_GROUP`. If no module declares the tag, the first module that uses it decides. A tag with no known family falls back to `Other`. A borrowed tag therefore never lands in two groups.
- The root seeds the first group (`Core`, with `System`), and `x-tagGroups` is created if absent.
- `fragments` order determines both path order and which declaration wins, so callers must pass them already ordered. `readModuleFragments` does this.
- Module discovery is the folder listing, so a folder with an `openapi.yaml` is enough to join the contract.
