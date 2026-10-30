---
source: tests/cross-cutting/example-template.test.ts
sha256: eabf67ddaf4e6de5252aacd93a9968f39c30ef134529ff590c16d196bb7c741e
generated_at: 2026-10-29T06:45:54.171012+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/example-template.test.ts

## Purpose

Guard test that enforces the `example` module's file-header convention: every non-test `.ts` source file must open with an `@module` doc comment whose first line is `In any module:`, body contains a `Here:` clause, and final line is `See: docs/…`. It exists so that any new or modified file in the template module is immediately flagged if it breaks the three-part header shape that scaffolders and humans rely on to copy the module correctly.

## Key elements

- **`sourceFiles(directory, prefix)`** — recursively collects every `.ts` file under a folder (excluding `tests/` subdirectories and `*.generated.ts`), returning paths relative to the root.
- **`headerLines(source)`** — extracts the content of the leading `/** … @module … */` block, strips comment markers, and returns an array of trimmed non-empty lines.
- **`EXAMPLE_ROOT`** — resolved path to the `example` module folder under `MODULES_ROOT`.
- **`describe('every file of the example module carries the template header', …)`** — top-level suite.
  - *`finds the module's files`* — sanity check that the walk discovers > 20 files (guards against a broken path).
  - *`it.each(files) '…opens with In any module:, says Here:, ends on See: docs/'`* — per-file assertion that the header starts, contains, and ends with the required markers, and that prose stays ≤ 10 lines (exempting `module.ts`, which carries a capability table).

## Relationships

- **`tests/support/paths.ts`** (`@tests/paths`) — provides `MODULES_ROOT`, the base directory from which `EXAMPLE_ROOT` is derived.

## Notes

- The 10-line prose cap intentionally exempts `module.ts` because its header includes a data-style capability table rather than free-form prose.
- `*.generated.ts` files are skipped by `sourceFiles`; they carry their own do-not-edit header and are not subject to the template convention.
- The `@module` regex in `headerLines` expects the `@module` tag to appear as its own line immediately after `/**`. A file that merges `@module` with other text will silently produce an empty header and fail the shape checks.
