---
source: scripts/pairing/sync-to-frontend.ts
sha256: a3ca937a5fb6ebfd7d95176b75611bf5511b2c4b99709a0bdbe80d0bc3359058
generated_at: 2026-11-08T02:56:54.846259+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/sync-to-frontend.ts

## Purpose

Copies every backend-owned shared file (as declared in `SHARED_FILES`) into the paired frontend checkout, verifying byte-identity before and after, then triggers the frontend's `npm run regenerate`. Exists so the two repos stay contractually in sync without manual file management; the backend is the single source of truth for these files.

## Key elements

- **`dryRun` / `forcedRun` / `regenerate`** — module-level booleans derived from `--dry`, `--forced`, and their complement. `regenerate` is always true unless `--dry` is set.
- **`frontendRoot`** — resolved via `resolveFrontendPath()`; the script exits early if the path doesn't exist.
- **`fail(message)`** — writes to stderr and calls `process.exit(1)`; returns `never` for control-flow narrowing.
- **`STALENESS_GATES`** — an array of child-process checks (currently: `build-bundles.ts --check`) that must pass before any byte is copied.
- **`Outcome` interface & `outcomes` array** — one entry per `SHARED_FILES` record; state is `copied`, `already-identical`, `would-copy`, or `missing-here`. Drives both the copy loop and the final report.
- **Regeneration step** — runs `npm run regenerate` in the frontend (inherited stdio). Deliberately unconditional: not gated on `moved.length` and not behind a flag.
- **Post-regeneration hash check** — re-reads each shared file on both sides; fails if the frontend's `prettier:fix` (or anything else) rewrote a file during regeneration.

## Relationships

- **`scripts/pairing/spec-identity.ts`** — supplies `SHARED_FILES` (the single source of the file list and per-side paths), `hashFile` (content comparison), and `THIS_REPO` (the key into each shared-file record for the backend path).
- **`scripts/pairing/paired-frontend-path.ts`** — supplies `resolveFrontendPath` (shell env → `.env` → sibling default) and `DEFAULT_FRONTEND_PATH` (used in the error message when no checkout is found).
- **`scripts/pairing/linked-worktree.ts`** — supplies `writesIntoMainFromWorktree`; the script refuses to copy into the frontend's main checkout when the current backend is a linked worktree.
- **`scripts/cli.ts`** — supplies `hasFlag` for parsing `--dry` and `--forced` from the process argument list.

## Notes

- `regenerate` is **not** a flag and **not** conditional on whether any file was copied. The rationale (documented inline): switching which backend a pair points at can leave the frontend's generated client stale even when `openapi.yaml` already matches byte-for-byte, making `moved.length === 0` a false "nothing to do" signal.
- The post-regeneration hash check runs **after** `npm run regenerate` on purpose: the frontend's regenerate pipeline ends in `prettier:fix`, which could reformat a shared document and silently fork the two repos.
- `missing-here` is the only non-fatal *state* in `Outcome` that is actually fatal: a declared-shared file absent on the backend side aborts the run.
- `execFileSync` for the staleness gate uses `stdio: ['ignore','ignore','pipe']` to capture stderr for the error message; the regeneration step uses `stdio: 'inherit'` so the frontend's own build output is visible verbatim.
