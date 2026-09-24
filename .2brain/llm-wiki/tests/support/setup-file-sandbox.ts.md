---
source: tests/support/setup-file-sandbox.ts
sha256: 40b94678da4519ecddcddac06c441d8aebba9b6b65f1de391b206261f1b0d04b
generated_at: 2026-09-23T20:14:01.035550+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup-file-sandbox.ts

## Purpose

Per-test-file Jest bootstrap that redirects all application file writes into a sandbox directory named after the running test file. It exists as a standalone `setupFilesAfterEnv` entry (rather than living in `setup.ts`) because Jest only exposes the current test file path at that lifecycle stage.

## Key elements

- **Module-level side effect** — The file has no named exports. Its sole job is to call `applyFileSandbox(expect.getState().testPath)` on import, wiring the sandbox for the test file Jest is about to execute.
- **`expect.getState().testPath`** — Used to obtain the absolute path of the current test file, which serves as the sandbox name.

## Relationships

- **`tests/support/file-sandbox.ts`** — Provides the `applyFileSandbox` function that this file imports and invokes. All sandbox-creation logic lives there; this file is a thin caller.

## Notes

- Must be registered in Jest config under `setupFilesAfterEnv`, **not** `setupFiles` or `setup.ts`. Placing it elsewhere would break the assumption that `expect.getState().testPath` is available and that the sandbox name matches the test file.
- The module is deliberately side-effect-only (the `@module` JSDoc tag signals this). There is nothing to import from it in test files.
