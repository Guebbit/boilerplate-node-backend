---
source: scripts/scaffold/apply.ts
sha256: a3fb503b267168acea0eb6a38edd7494891feb2d58fc663f46a8cfa51e213867
generated_at: 2026-10-15T09:45:00.763134+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/apply.ts

## Purpose

The I/O half of the module scaffolder. Given a repo root and parsed options, it checks for conflicts (existing directory, doc file, registry entry, schema-name collision) and, if clear, writes the planned files and central-edit results to disk. All decisions about *what* to write live in the pure siblings (`plan.ts`, `central-edits.ts`); this file only performs the reads and writes.

## Key elements

- **`REGISTRY`** – constant (`'src/modules.ts'`) pointing to the module registry file.
- **`takenSchemaNames(root)`** – walks every module folder containing an `openapi.yaml`, reads its contract fragment, and returns a `Set` of all declared schema names.
- **`refusalsFor(root, plan)`** *(exported)* – returns a list of human-readable strings explaining why the scaffold must not proceed (existing dir, existing doc, already-registered name, colliding schema names).
- **`writePlanned(root, relative, content, formatText)`** – creates parent directories and writes one planned file through the injected `formatText` formatter.
- **`applyScaffold(root, options, formatText)`** *(exported, main entry point)* – calls `planModule`, runs `refusalsFor`, computes all central edits (read → apply → format) in parallel, then writes planned files and edits sequentially. Throws with every reason joined on newlines if any refusal applies.

## Relationships

- **`./plan.ts`** – provides `planModule`, `collidingSchemas`, and the `ScaffoldPlan` type that drive everything here.
- **`./central-edits.ts`** – provides `centralEdits`, which returns the list of edits to existing central files (registry, barrel, etc.).
- **`./format-text.ts`** – supplies the `FormatText` type; the function is injected by the caller so this module never imports Prettier.
- **`./registry.ts`** – provides `isRegistered` used during refusal checks.
- **`./options.ts`** – supplies the `ScaffoldOptions` type accepted by `applyScaffold`.
- **`../modules-on-disk.ts`** – provides `modulesWith` to enumerate module folders for schema-name collection.
- **`../contracts/fragments.ts`** – provides `readModuleFragment` to extract schema names from each module's `openapi.yaml`.
- **`tests/unit/scripts/scaffold/apply.test.ts`** – unit-tests the refusal and write paths using a scratch root and an identity `formatText`.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** – exercises scaffold-apply in the context of CI wave mutations.

## Notes

- **Atomicity guarantee:** all central edits are fully computed (file read, transformation applied, text formatted) *before* any `writeFileSync` call. A failure mid-batch leaves the tree untouched rather than half-scaffolded.
- **`formatText` is a required parameter, not defaulted.** This keeps the module free of a Prettier dependency and lets tests pass an identity function.
- **`root` is always explicit.** There is no process-cwd fallback; tests pass a temporary directory, production passes the real repo root.
- Refusal checks cover four independent cases (dir, doc, registry, schema clash) and all reasons are reported together in a single thrown error, not the first one found.
