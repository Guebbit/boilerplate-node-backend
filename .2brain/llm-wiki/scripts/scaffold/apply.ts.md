---
source: scripts/scaffold/apply.ts
sha256: bc69c83f524cac4d6e7e3c566d8a15ac3a1283edcc1a936af900792b59e638ee
generated_at: 2026-10-14T07:30:45.191025+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/apply.ts

## Purpose

The disk-writing half of the module scaffolder. It refuses to proceed when the target module already exists (directory, doc, registry entry, or schema-name clash), then writes the planned files and the central-file edits it computes. All decisions (what to create, what to name) live in the pure sibling modules; this file's only job is I/O under a caller-supplied `root` so tests can aim it at a scratch directory.

## Key elements

- **`applyScaffold(root, options, formatText)`** *(exported)* — Main entry point. Calls `planModule`, checks `refusalsFor`, computes central edits, then writes every planned file and every edited central file. Throws an `Error` listing all refusal reasons if any exist. Returns the `ScaffoldPlan` that was written.
- **`refusalsFor(root, plan)`** *(exported)* — Returns an array of human-readable refusal strings: module directory already exists, doc file already exists, name already registered in `src/modules.ts`, and/or schema names collide with another module's contract fragment.
- **`takenSchemaNames(root)`** *(private)* — Reads every `src/modules/<name>/openapi.yaml` and returns a `Set` of all declared schema names via `components.schemas`.
- **`writePlanned(root, relative, content, formatText)`** *(private)* — Creates the parent directory and writes one formatted file.
- **`FragmentShape`** — Minimal structural type (`components.schemas`) used to narrow the YAML parse result from `openapi.yaml` fragments.
- **`REGISTRY`** — Constant `'src/modules.ts'`, the repo-relative path of the central registry file.

## Relationships

- **`./plan`** — Imports `planModule` (produces the `ScaffoldPlan` this file writes), `collidingSchemas` (used inside `refusalsFor` to detect name clashes), and the `ScaffoldPlan` type.
- **`./central-edits`** — Imports `centralEdits`, which yields an array of edit descriptors (`{ path, apply }`). `applyScaffold` reads each target file, applies the edit function, formats the result, and writes it back.
- **`./options`** — Imports the `ScaffoldOptions` type used as the configuration parameter.
- **`./format-text`** — Imports the `FormatText` type. The formatter is injected as a parameter (never defaulted) so this module never loads Prettier itself; tests pass an identity function.
- **`./registry`** — Imports `isRegistered` to check whether the kebab-case name is already present in `src/modules.ts`.
- **`tests/unit/scripts/scaffold/apply.test.ts`** — Unit tests that exercise `applyScaffold` and `refusalsFor` against a scratch directory with an identity `formatText`, relying on the `root`-parameter design of this module.

## Notes

- All central edits are computed **before** any file is written (`Promise.all` over `centralEdits`), so a failure leaves the tree untouched rather than half-scaffolded.
- `formatText` is required, not optional — this file deliberately avoids importing a formatter, keeping its I/O dependency surface to `node:fs` only.
- `takenSchemaNames` reads `openapi.yaml` via the `yaml` package's `parse`; an empty file yields `null`, which the code handles with `?? {}`.
- The refusal for schema clashes suggests the `--entity` flag as the user-facing remedy; the flag itself is parsed in `./options`.
