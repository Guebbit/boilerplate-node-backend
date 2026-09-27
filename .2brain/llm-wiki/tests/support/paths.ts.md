---
source: tests/support/paths.ts
sha256: 8c5a8ff09c7ba941e845a0bd38888a408c229ec1ff347a65cd6b76fd06c1802b
generated_at: 2026-09-27T16:00:33.570887+00:00
model: ollama:qwen3.8:27b
---

# tests/support/paths.ts

## Purpose

Provides two resolved filesystem paths (`REPO_ROOT`, `MODULES_ROOT`) that cross-cutting and cluster tests use to walk the source tree by hand (reading contract fragments, checking generated files, enumerating module directories). It exists so every test that needs a repo-absolute path computes it identically and correctly regardless of where `jest` was invoked.

## Key elements

- **`REPO_ROOT`** – `path.join(__dirname, '..', '..')`; the repository root directory, derived from `__dirname` (not `process.cwd()`) so it is stable regardless of the jest invocation directory.
- **`MODULES_ROOT`** – `path.join(REPO_ROOT, 'src', 'modules')`; the directory containing one subdirectory per application module.

## Relationships

- Imported by every file under `tests/cross-cutting/` (`analytics-events`, `api-key-authentication`, `audit-actions`, `authenticated-controllers`, `contract-error-declarations`, `credential-fields`, `locale-namespaces`, `mail-copy`, `metric-names`, `module-descriptors`, `modules-are-enabled`, `outbox-names`, `probes-are-wired`, `process-snapshot`) to locate `src/modules` or the repo root when the test needs to read source files directly.
- Imported by `tests/cluster/support/cluster.ts` for the same tree-walking purpose.
- Pulled in transitively by `file-sandbox.ts` (which reads `REPO_ROOT` from here), and that file is loaded by `globalSetup` / `globalTeardown` outside jest's `moduleNameMapper`.

## Notes

- **Import constraint:** this file (and everything it imports) must use only relative or `node:*` specifiers. Because `globalSetup`/`globalTeardown` load `file-sandbox.ts` → this file *before* `moduleNameMapper` is active, any aliased import on that chain would resolve against the developer's local `tsconfig` paths rather than inside the jest worker, causing a silent path mismatch.
- Paths are computed from `__dirname`, not `process.cwd()`, so they remain correct even when jest is launched from a sub-directory.
