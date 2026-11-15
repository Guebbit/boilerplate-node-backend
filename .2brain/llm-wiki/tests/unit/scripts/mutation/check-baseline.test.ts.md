---
source: tests/unit/scripts/mutation/check-baseline.test.ts
sha256: b760804278b30a03614d77c08beac2fde842a5e9cbca23b522fceffccded2040
generated_at: 2026-11-15T00:26:42.492147+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/check-baseline.test.ts

## Purpose

Tests the CLI behavior of `scripts/mutation/check-baseline.ts` when a mutation report contains a file that was never recorded in the baseline. Verifies that a plain check does **not** silently claim a recording, while the `--update` flag does record the new file. Runs the script as a real subprocess in a throwaway scratch directory so no repo files are touched.

## Key elements

- **`runCheck(...flags)`** — Helper that creates a temp directory with a pre-seeded `mutation-baseline.json` (one file, `src/old.ts`) and a `mutation.json` report (two files, `src/old.ts` + `src/fresh.ts`), then spawns `tsx scripts/mutation/check-baseline.ts` with the given flags. Returns `{ output, baseline }` for assertions.
- **`afterEach` cleanup** — Splices and deletes every scratch directory created during the test run via `rmSync(..., { recursive: true, force: true })`.
- **`describe('check-baseline new-file line')`** — Two cases:
  - Plain check: asserts output does *not* contain "new file recorded" and the baseline file does *not* contain `src/fresh.ts`.
  - `--update` check: asserts output *does* contain "new file recorded: src/fresh.ts" and the baseline *does* contain `src/fresh.ts`.

## Relationships

No graph neighbors. The test invokes the script under test via `spawnSync` with a filesystem path (not a module import), so the dependency is invisible to static analysis.

## Notes

- The repo root is resolved as `path.resolve(__dirname, '../../../..')`; the script and `tsx` binary are both addressed relative to that root.
- The test runs the script as a **subprocess** (not in-process), so mocking framework internals is not possible — assertions are limited to stdout/stderr text and the rewritten baseline file on disk.
- Scratch directories are accumulated in a module-level `scratch` array and cleaned up in `afterEach`; if a test crashes before `afterEach` runs, temp dirs under `os.tmpdir()` matching `mutation-check-*` may be left behind.
