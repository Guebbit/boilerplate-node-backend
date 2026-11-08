---
source: tests/support/setup-file-sandbox.ts
sha256: 40b94678da4519ecddcddac06c441d8aebba9b6b65f1de391b206261f1b0d04b
generated_at: 2026-11-08T10:00:05.070199+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup-file-sandbox.ts

## Purpose

Jest `setupFilesAfterEnv` hook that redirects the application's file writes into a per-test-file sandbox. It exists separately from the shared `setup.ts` because the sandbox must be named after the specific test file that is about to run, and Jest only exposes that path at the `setupFilesAfterEnv` stage.

## Key elements

- **`applyFileSandbox(testPath)`** (imported from `./file-sandbox`) — called immediately at module load with `expect.getState().testPath`. Configures the sandbox so all file I/O for the current test file is redirected into a directory named after that file.
- The file has **no exports**; it is a side-effect-only module consumed by Jest via its `setupFilesAfterEnv` config.

## Relationships

- **`tests/support/file-sandbox.ts`** — provides `applyFileSandbox`, the single function this file calls. The sandbox implementation (directory creation, path redirection, teardown) lives there; this file only supplies the test-file-specific path at the right Jest lifecycle moment.

## Notes

- Ordering matters: this runs **after** `setup.ts` but **before** any test in the file executes. Placing it in `setupFilesAfterEnv` (rather than `setupFiles`) is what guarantees `expect.getState().testPath` is already populated with the current test file.
- Because it is a side-effect module, it must be referenced in the Jest config's `setupFilesAfterEnv` array, not imported by individual test files.
