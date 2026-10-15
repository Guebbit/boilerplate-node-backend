---
source: tests/support/paths.ts
sha256: 0087a6036c1523b504942ef311cb2754ee3bf8ffac1d606b91137403ae88862c
generated_at: 2026-10-15T12:59:13.097280+00:00
model: ollama:qwen3.8:27b
---

# tests/support/paths.ts

## Purpose

Provides stable filesystem path constants and a module-existence check for tests that walk the repository tree (contract fragments, generated-file freshness checks, per-module sweeps). Exists so every test resolves paths relative to the repo layout rather than the shell's working directory, and so the critical import chain stays free of Jest module aliases.

## Key elements

- **`REPO_ROOT`** – Absolute path to the repository root, computed as `path.join(__dirname, '..', '..')`. Intended for tests that manually walk the tree.
- **`MODULES_ROOT`** – `REPO_ROOT / src / modules`; the directory that contains one subdirectory per module.
- **`isDeployed(moduleName)`** – Returns `true` if `MODULES_ROOT/<moduleName>` exists on disk. Lets tests filter an expected set of artifacts down to what is actually present, so removing a module shrinks the expectation instead of failing the test.

## Relationships

- Imported by every cross-cutting test listed in the graph (e.g. `analytics-events.test.ts`, `audit-actions.test.ts`, `contract-search-parity.test.ts`, …) to obtain `REPO_ROOT`, `MODULES_ROOT`, or `isDeployed`.
- `tests/cluster/support/cluster.ts` and `src/modules/orders/tests/unit/withdrawal-notice.test.ts` also depend on these paths.
- The header comment notes that `file-sandbox.ts` re-exports `REPO_ROOT`, and `globalSetup`/`globalTeardown` load `file-sandbox.ts` outside Jest's `moduleNameMapper`. This file must therefore use only relative or `node:*` specifiers—any aliased import on this chain would resolve in the developer's shell rather than in Jest's worker.

## Notes

- **No alias imports.** The file deliberately restricts itself to `node:fs` and `node:path` (relative or built-in specifiers) so the `globalSetup` → `file-sandbox.ts` → `paths.ts` chain stays resolvable in a bare `node` context where Jest's `moduleNameMapper` is not active.
- **`__dirname`-based, not `cwd`-based.** Paths are anchored to the file's own location, so tests produce the same result regardless of the directory from which `jest` is invoked.
- **`isDeployed` is a soft gate.** It does not signal an error; it simply narrows a test's expected set to what is checked out, keeping "exact" assertions valid after a `demo:remove`-style module deletion.
