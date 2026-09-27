---
source: scripts/pairing/sync-to-frontend.ts
sha256: dcdb35771ae5abbadd3b2e0c4ed0f94bc8f306d771811feacd9acf6af25f88d1
generated_at: 2026-09-27T13:59:36.339567+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/sync-to-frontend.ts

## Purpose

Copies every backend-owned shared file (declared in `SHARED_FILES`) into the paired frontend checkout, then triggers the frontend's own regeneration step so its typed clients reflect the new contract. Exists as the single entry point (`npm run sync:frontend`) that keeps the two repos' shared files byte-identical without requiring a human to remember which files moved.

## Key elements

- **`--dry`** — report what would be copied; skips all writes *and* the frontend `npm run regenerate`.
- **`--forced`** — copy every shared file even when the hash already matches; skips the identity short-circuit.
- **`STALENESS_GATES`** — array of child-process checks (currently `scripts/contracts/build-bundles.ts --check`) that must pass before any byte is written. A non-zero exit aborts the run.
- **`fail(message)`** — prints to stderr and exits 1.
- **`Outcome` interface** — per-file result: `copied | already-identical | would-copy | missing-here`. `missing-here` is fatal.
- **Frontend regeneration** — after copying, runs `npm run regenerate` in the frontend (inherited stdio). Deliberately unconditional: a no-op copy can still leave a stale generated client if the pair's backend changed.
- **Post-regeneration integrity check** — re-reads each shared file on both sides; if they diverge (e.g. the frontend's `prettier:fix` reformatted a shared doc), the run fails with a hint to check the frontend's `.prettierignore`.

## Relationships

- **`scripts/pairing/spec-identity.ts`** — source of truth for the file list (`SHARED_FILES`), the per-side path keys (`THIS_REPO`, `.frontend`), and the `hashFile` helper used for identity comparison.
- **`scripts/pairing/paired-frontend-path.ts`** — provides `resolveFrontendPath()` (shell env → `.env` → sibling default) and `DEFAULT_FRONTEND_PATH` for error messaging.
- **`scripts/pairing/linked-worktree.ts`** — `writesIntoMainFromWorktree` is consulted (non-dry runs only) to refuse writing into the frontend's *main* checkout when the current backend checkout is a linked worktree.

## Notes

- The script is a one-directional write: backend owns the files, frontend copy is an output. Files that are merely "kept identical for convenience" are intentionally absent from `SHARED_FILES` and never touched here.
- `mkdirSync` with `recursive: true` is called before each copy because a shared file may sit in a directory the frontend has not yet created.
- The regeneration step is **not** gated on whether any file was actually copied. This is intentional (see in-code comment): switching which backend a pair points at can leave `openapi.yaml` already identical while `contracts/rest/*` still reflects the previous backend's client.
- The post-regeneration hash check runs *after* `npm run regenerate` on purpose, so it also catches a prettier reformat that would otherwise silently fork the two repos.
- `execFileSync` for the staleness gates captures only stderr (`stdio: ['ignore','ignore','pipe']`) because that is where the gate's diagnostic lives; the frontend regeneration uses `stdio: 'inherit'` so its own output is visible unfiltered.
