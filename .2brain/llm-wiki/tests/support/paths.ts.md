---
source: tests/support/paths.ts
sha256: 0087a6036c1523b504942ef311cb2754ee3bf8ffac1d606b91137403ae88862c
generated_at: 2026-11-08T09:57:04.414183+00:00
model: ollama:qwen3.8:27b
---

# tests/support/paths.ts

## Purpose

Provides filesystem paths and a module-existence check for tests that need to inspect the repository tree directly (reading contract fragments, verifying generated files, listing modules). It isolates the "where is the repo?" question so every test file references the same stable root regardless of the working directory from which jest was launched.

## Key elements

- **`REPO_ROOT`** – The repository root, computed as `path.join(__dirname, '..', '..')`. Intentionally `__dirname`-relative (not `process.cwd()`) so it is correct no matter where jest is invoked.
- **`MODULES_ROOT`** – `REPO_ROOT / 'src' / 'modules'`; the directory containing one subdirectory per business module.
- **`isDeployed(moduleName: string): boolean`** – Returns `true` if `src/modules/<moduleName>/` exists in the current checkout. Tests that assert an exact set of per-module artifacts filter their expected list through this, so removing a module (e.g. via `demo:remove`) shrinks the expectation instead of causing a failure.

## Relationships

- **All listed test files** (cross-cutting, contract, cluster, and orders unit tests) import `REPO_ROOT`, `MODULES_ROOT`, and/or `isDeployed` from this file to locate module directories on disk for their assertions.
- **`tests/support/file-sandbox.ts`** (referenced in the file's header comment) imports `REPO_ROOT` from this file. Because `file-sandbox.ts` is loaded by jest's `globalSetup`/`globalTeardown`—outside the `moduleNameMapper` scope—this file must use only relative or `node:` protocol imports; any aliased import on that chain would resolve to the developer's filesystem rather than jest's sandbox.

## Notes

- **Import restriction is load-bearing.** The file must never introduce a project alias (e.g. `@/…`) or a bare-package import. The `globalSetup`/`globalTeardown` → `file-sandbox.ts` → `paths.ts` chain executes before jest's module resolution is fully configured, so an aliased import here would silently resolve incorrectly.
- **`isDeployed` is a soft gate, not a registration mechanism.** It does not add or remove modules; it simply lets tests skip expectations for a module whose folder has been deleted from the checkout, keeping "exact set" assertions green after a `demo:remove` operation.
