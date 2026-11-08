---
source: tests/unit/scripts/audit/shallow-candidates.test.ts
sha256: b2164b9ce62f03c1e01332ad81448b353500dd811284a3e06f8063c2ffe1569a
generated_at: 2026-11-08T10:31:41.638865+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/audit/shallow-candidates.test.ts

## Purpose

Unit tests for the `findShallowCandidates` function in the code-shape audit. Each test builds a tiny in-memory TypeScript program (via a custom `CompilerHost`) so that candidate counts and classifications can be verified against code small enough to inspect by eye.

## Key elements

- **`analyse(files, scope?)`** — helper that wires an in-memory `ts.CompilerHost` (rooted at `/repo`), creates a `ts.Program` with `noLib: true` and `setParentNodes` enabled, then calls `findShallowCandidates`. Accepts a map of repo-relative paths to source text and an optional scope (defaults to `['src']`).
- **`namesOf(entries)`** — extracts the `name` or `file` field from a mixed candidate list for simple assertions.
- **`describe('smallAndRare')`** — verifies detection of ≤ 3-line bodies with 1–2 callers, renamed-import / shorthand-property reference counting, exclusion of > 2 users, zero-reference (dead) code, > 3-line bodies, test-file references, and exclusion of functions living inside a module's own `tests/` folder.
- **`describe('passThroughs')`** — verifies that a single-statement body forwarding its own parameters is flagged (with `forwardsTo`), while partial application, argument reordering, and multi-statement block bodies are *not*.
- **`describe('optionalNeverPassed')`** — verifies that an optional/defaulted parameter never supplied at any call site is reported, and is dropped when any caller passes it or the function is used as a callback.
- **`describe('lazyFiles')`** — verifies flagging of files with ≤ 2 exports and ≤ 2 importers, exclusion of files with > 2 exports, and exclusion of files that are part of a recognized module layout.
- **`describe('published')`** — verifies the `published` flag is set when a symbol (or its file) is reachable through a barrel `export *` chain, even through intermediate `index.ts` re-exports.

## Relationships

- **`scripts/audit/code-shape/scripts/shallow-candidates.ts`** — the module under test; this file imports `findShallowCandidates` and the `ShallowReport` type from it.

## Notes

- `ts.createSourceFile` is called with `setParentNodes = true` (4th argument); the audit walks parent pointers, so this flag is required for correct analysis.
- `noLib: true` is set because the in-memory programs never need the standard library; it also prevents accidental resolution of ambient globals.
- Functions that live under a `tests/` directory inside a module (e.g. `src/modules/shop/tests/…`) are excluded from the candidate list, but test files *outside* the scope (e.g. `tests/…` at the repo root) still count as references.
- Zero-reference (dead) functions are deliberately **not** reported here — the comment notes that is Knip's job.
