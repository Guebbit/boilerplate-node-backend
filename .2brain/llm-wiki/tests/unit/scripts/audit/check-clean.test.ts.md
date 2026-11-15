---
source: tests/unit/scripts/audit/check-clean.test.ts
sha256: aa92c3d98a4da0748b38103482e99ffbe28b27e41a61693e38ec613db8d6597b
generated_at: 2026-11-15T00:25:15.283392+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/audit/check-clean.test.ts

## Purpose

Unit tests for the `check-clean` tripwire: verifies that the audit runner can detect when a run writes files, creates branches/commits/stashes, or otherwise mutates the repo outside its designated report folder. Each test builds a real temporary git repository so that `snapshotRepo` / `diffSnapshots` operate on genuine git state rather than mocks.

## Key elements

- **`RUN`** – constant string (`tmp/reports/audit-2026-01-01-0000/spec-drift`) representing the run folder that writes inside it should *not* be flagged.
- **`repo`** – module-level mutable holding the current temp-repo path; reset in every `beforeEach`.
- **`git(...args)`** – helper that runs `git` via `execFileSync` in the temp repo with `-c user.name` / `-c user.email` overrides and `gitEnvironment()`.
- **`write(file, text)`** – helper that creates directories and writes a file relative to the temp repo.
- **`reportAfter(change)`** – core test pattern: calls `snapshotRepo`, applies `change`, calls `snapshotRepo` again, returns `diffSnapshots(before, after, RUN)`.
- **`beforeEach` / `afterEach`** – create a fresh temp git repo (one commit, `tmp/` in `.gitignore`) and remove it after each test.
- **`describe('check-clean')`** – seven cases covering: no-change (empty report), write inside run folder (no flag), write outside run folder, new untracked file, new branch, new commit, and new stash.

## Relationships

- **`scripts/audit/check-clean.ts`** – the module under test; provides `snapshotRepo` (captures git state) and `diffSnapshots` (compares two snapshots and returns human-readable rows of unexpected changes).
- **`scripts/git-base.ts`** – provides `gitEnvironment()`, a sanitized env object passed to every `execFileSync` git call to keep tests independent of the developer's global git configuration.

## Notes

- Tests use **real** `mkdtempSync` temp directories and real `git` binaries, not in-memory fakes. This means they are integration-flavored unit tests and will be slower than pure-logic tests.
- `.gitignore` is seeded with `tmp/` to mirror the production repo, ensuring the "inside the run folder" case exercises the actual ignore-path logic in `diffSnapshots`.
- The `git` helper sets identity flags inline (`-c user.name=t …`) so commits work without a global `[user]` section.
- `afterEach` uses `rmSync(…, { recursive: true, force: true })`; if a test leaves the repo in a locked state (e.g., an open git lock file), the cleanup may silently no-op on some platforms.
