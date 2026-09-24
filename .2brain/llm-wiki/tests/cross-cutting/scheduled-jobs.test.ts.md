---
source: tests/cross-cutting/scheduled-jobs.test.ts
sha256: ed05849abff25166a0eccee044062dd45fc7facdca0b094c4f178ae9aef143d1
generated_at: 2026-09-23T19:59:28.204588+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/scheduled-jobs.test.ts

## Purpose

Cross-cutting integrity test that verifies `docker/crontab` and the `reap:*`/`sweep:*` scripts in `package.json` reference each other correctly in **both** directions, and that every scheduled script points to a file that still exists on disk. It exists because nothing else in the codebase enforces that the two "source of truth" locations (crontab + package.json) stay in sync, and a silent drift (dangling cron entry or unscheduled cleanup) would otherwise go unnoticed.

## Key elements

- **`scriptsInCrontab(): string[]`** — Reads `docker/crontab`, skips comments/blank lines, extracts every `npm run <name>` via regex.
- **`scheduledPackageScripts(): Record<string, string>`** — Reads `package.json` and filters scripts whose names match `reap:*` or `sweep:*`.
- **`describe('docker/crontab and package.json agree…')`** — Two assertions: every crontab script name exists in `package.json`, and every `reap:*`/`sweep:*` script is present in the crontab. A third "canary" assertion guarantees both sides returned ≥ 1 entry (prevents a vacuous pass if a file path silently breaks).
- **`describe('every scheduled script names a file that exists')`** — For each `reap:*`/`sweep:*` entry, extracts the `.ts` file path from the command (`tsx <path>`) and asserts it exists on disk. Catches the case where a module is deleted but the script name remains valid in `package.json`.

## Relationships

No graph neighbors are listed for this file. It interacts with the repo only by reading `docker/crontab` and `package.json` from the filesystem at test-execution time; it imports no project source modules.

## Notes

- The test resolves paths relative to `tests/cross-cutting/` via `path.join(__dirname, '..', '..')` to reach repo root — not via any imported config.
- The "canary" test (`actually reads both sides`) exists because an empty result from a broken file path would make the bidirectional assertions pass trivially.
- The file-existence check parses the command string with `/tsx (\S+\.ts)/`; if a scheduled script changes its invocation style (e.g., drops `tsx`), the regex silently fails to extract a path and the assertion reports `undefined` rather than a clear error.
- This test is intentionally **not** unit-level: it guards an operational contract between two text files and the filesystem, not a module's behavior.
