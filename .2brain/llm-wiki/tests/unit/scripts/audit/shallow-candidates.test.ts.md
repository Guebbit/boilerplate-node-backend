---
source: tests/unit/scripts/audit/shallow-candidates.test.ts
sha256: b2164b9ce62f03c1e01332ad81448b353500dd811284a3e06f8063c2ffe1569a
generated_at: 2026-10-15T13:25:13.199345+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/audit/shallow-candidates.test.ts

## Purpose

Unit tests for the `findShallowCandidates` audit. Each case assembles a tiny in-memory TypeScript program (2–4 source files) via the TypeScript Compiler API and asserts that the resulting `ShallowReport` flags exactly the expected candidates. The in-memory approach means every fixture is small enough to verify by eye.

## Key elements

- **`analyse(files, scope?)`** – Test helper. Builds a `ts.Program` over the given `Record<string, string>` using a minimal `ts.CompilerHost` (no lib, ESNext modules, bundler resolution), then calls `findShallowCandidates(program, ROOT, scope)`. Returns the full `ShallowReport`.
- **`namesOf(entries)`** – Extracts `.name` or `.file` from a mixed candidate list for easy assertions.
- **`describe('smallAndRare')`** – Verifies detection of small (≤ 3 body lines), rarely-used (1–2 references) functions; confirms exclusion of dead code, long bodies, and functions inside a module's own `tests/` folder.
- **`describe('passThroughs')`** – Verifies detection of one-line bodies that merely forward all parameters to a callee; confirms partial application, reordering, and multi-statement blocks are *not* flagged.
- **`describe('optionalNeverPassed')`** – Verifies detection of optional/defaulted parameters never supplied at any call site; confirms exclusion when any caller does pass them or when the function is used as a bare callback.
- **`describe('lazyFiles')`** – Verifies detection of files with ≤ 2 exports and a single importer; confirms exclusion for larger files and for files required by a module layout (`routes.ts`, `controllers/*`, `module.ts`).
- **`describe('published')`** – Verifies the `published` flag propagates through intermediate barrel `index.ts` re-exports down to the leaf declaration.

## Relationships

- **`scripts/audit/code-shape/scripts/shallow-candidates.ts`** – The module under test. Provides `findShallowCandidates` and the `ShallowReport` type. This file imports both and exercises every category the report exposes.

## Notes

- `noLib: true` in the compiler options means no standard-library types are available; fixtures must be self-contained.
- `ts.createSourceFile(…, true)` sets parent pointers on the AST, which the audit walks upward from. Omitting the fourth argument would break the analysis.
- The default `scope` is `['src']`, so `tests/`-directory files are treated as *callers* (counting toward `references`) but are never themselves candidates.
- The `published` test relies on a two-level barrel chain (`index → services/index → price`) to confirm transitive re-export detection.
