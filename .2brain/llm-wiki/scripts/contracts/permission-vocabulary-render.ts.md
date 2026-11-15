---
source: scripts/contracts/permission-vocabulary-render.ts
sha256: a58337b8f779b7fed54c76279564ac7a4b778d151901b8ddfec78b1e02d45fa9
generated_at: 2026-11-14T17:28:17.963083+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/permission-vocabulary-render.ts

## Purpose

The pure (I/O-free) half of the permission-vocabulary generator. It reads the closed authorization lists from a shared YAML document (`authorization-keys.generated.yaml`), validates them, and renders the TypeScript module that re-exports those lists as `as const` arrays plus derived union types. Keeping it free of filesystem calls lets unit tests exercise the full parse → validate → render pipeline in isolation.

## Key elements

- **`PermissionVocabulary`** (interface) — the shape of every closed list: `actions`, `subjects`, `ruleIds`, `setNames`, `scopes`, `stepUpTiers`, and `pairs` (subject → actions map).
- **`readPermissionVocabulary(yamlText: string): PermissionVocabulary`** — parses the YAML, extracts each list, enforces non-emptiness, uniqueness, and cross-references (every rule's action/scope/stepUp must appear in its declared list). Throws descriptive `Error`s on any violation.
- **`renderPermissionVocabulary(vocabulary: PermissionVocabulary): string`** — emits the full text of the generated TypeScript file (six `as const` arrays + their union types + `PERMISSION_PAIRS` + `ActionOn<S>`).
- **`stringList`, `mappingKeys`, `fieldOfEach`, `assertUnique`** (private helpers) — targeted extractors that throw early with a message naming the offending key and the source file.
- **`renderList`** (private helper) — renders one `as const` array + its `(typeof …)[number]` union, given a name, type name, description, and items.

## Relationships

- **`scripts/contracts/generate-permission-vocabulary.ts`** — the file-system half; it reads the YAML from disk and hands the text to `readPermissionVocabulary`, then writes the result of `renderPermissionVocabulary` to the output file. This module is its "pure" counterpart (no `fs` import).
- **`src/infrastructure/object-guards.ts`** — supplies `isPlainObject`, used inside `mappingKeys` to safely treat a parsed YAML value as a record.
- **`tests/unit/scripts/contracts/permission-vocabulary-render.test.ts`** — unit tests that drive `readPermissionVocabulary` and `renderPermissionVocabulary` directly with in-memory strings, covering valid documents, missing lists, duplicates, and undeclared cross-references.

## Notes

- **Shared script, not in `SHARED_FILES`.** The header comment and `docs/tools/pairing-and-ports.md` ("Convenience is not necessity") state it is kept identical across the two paired repos *by hand*, deliberately excluded from the automated sync list.
- **No filesystem access.** The only I/O dependency is the `yaml` parse call; all functions accept and return strings/objects, so tests never touch disk.
- **Error messages are stable and reference `authorization-keys.generated.yaml` by name**, even though this file never reads that path — the message is meant for the operator looking at the source document.
- **`pairs` initialization** uses `[] as string[]` to sidestep TypeScript inferring `never[]` from an empty array literal (see inline comment).
- **Generated output is marked `DO NOT EDIT`** and carries a regenerate hint (`npm run gen:api`); the file header of this module points to `docs/tools/permission-vocabulary.md` for the full contract.
