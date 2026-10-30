---
source: scripts/audit/code-shape/scripts/shallow-candidates.ts
sha256: 8fd31ff76d16bf44453bacdc153a15121c4f326035e7e846ebe00e9326346db7
generated_at: 2026-10-29T01:28:46.459862+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/code-shape/scripts/shallow-candidates.ts

## Purpose

Counting module for the `code-shape` audit. It walks the TypeScript AST of the project and produces four candidate lists (small-and-rare functions, pass-throughs, optional-never-passed functions, lazy files) using the TS type checker rather than text search, so import aliases, re-exports, and shorthand properties all resolve to the single declaration they name. It reports facts only; every pass/fail verdict is made downstream in `SKILL.md`.

## Key elements

- **`FunctionFacts`** (exported interface) — one named function: file, line, name, body line count, reference count, referencing files, optional `forwardsTo` callee, `optionalNeverPassed` param names, and `published` flag.
- **`FileFacts`** (exported interface) — one file: export count, list of importing files, and `published` flag.
- **`ShallowReport`** (exported interface) — the four candidate arrays: `smallAndRare`, `passThroughs`, `optionalNeverPassed`, `lazyFiles`.
- **`targetOf`** — resolves an identifier through shorthand properties and import aliases to its ultimate symbol via the checker.
- **`collectUsage`** — single AST walk over all project files; records reference count, source files, and per-call argument counts per symbol.
- **`namedFunctionOf`** — extracts a `NamedFunction` (name, body, params) from either a `FunctionDeclaration` or a variable holding an arrow/function expression.
- **`soleCall` / `forwardTarget`** — detects whether a body is a single (possibly `await`/paren-wrapped) call whose arguments exactly mirror the function's own parameters, yielding the callee name.
- **`optionalNeverPassed`** — flags optional parameters at or beyond the maximum argument count observed across all direct calls; returns `[]` if any use is non-call (e.g. callback).
- **`moduleFileOf`** — resolves a module specifier string literal to a project source file via the checker.
- **Constants** — `SMALL_BODY_LINES` (3), `FEW_USERS` (2), `FEW_EXPORTS` (2), `BARREL` (regex for module index files), `NEVER_A_CANDIDATE` (tests / generated / api), `LAID_OUT_FILE` (layout-mandated module files), `PLUMBING` (node kinds that are import/export syntax, not real uses).

## Relationships

- **`generate-shallow-candidates.ts`** — the orchestrator that builds the `ts.Program`, supplies the `relativeOf` mapper, and calls this module's exported entry point to obtain the `ShallowReport`.
- **`tests/unit/scripts/audit/shallow-candidates.test.ts`** — unit-tests the exported interfaces and internal helpers (pass-through detection, optional-param detection, barrel exclusion, etc.) against fixture files.
- **`scripts/scaffold/scenario-registry.ts`** — referenced in the dependency graph; the file content does not show a direct import from this module, so the relationship is likely indirect (shared fixture paths or a parent script that chains both).

## Notes

- The module is intentionally **counts-only**. Thresholds (`SMALL_BODY_LINES`, `FEW_USERS`, `FEW_EXPORTS`) are hard-coded constants here; changing a threshold changes which facts are emitted but does not change how any fact is computed.
- `optionalNeverPassed` bails out to `[]` whenever even one use is not a direct call (e.g. the function is passed as a callback), because the caller's argument count is unknowable in that case.
- `forwardsTo` comparison is textual (parameter names as written, with `...` markers preserved). A body that reorders, renames, or drops a parameter will **not** be flagged as a pass-through.
- `PLUMBING` excludes import/export syntax nodes from the reference count so that `import { f } from './x'` does not inflate `references`.
- `NEVER_A_CANDIDATE` and `LAID_OUT_FILE` are path-based exclusions; they affect candidacy but the files still count as *users* of symbols they import.
- The file content shown is truncated at `moduleFileOf`; the main exported function that assembles the `ShallowReport` is below the truncation point.
