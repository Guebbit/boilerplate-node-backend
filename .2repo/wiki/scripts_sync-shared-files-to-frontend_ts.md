# scripts/sync-shared-files-to-frontend.ts

## Purpose

Copies every backend-owned shared file into the paired frontend checkout, guaranteeing the frontend's copies are byte-identical outputs of this repo's sources. Exists so that a single command (`npm run sync:frontend`) can move the contract bundles and demo dataset across the repo boundary and then leave the frontend in a fully regenerated, verified state.

## Key elements

- **Staleness gates** (`STALENESS_GATES`) — two `--check` invocations (`build-contract-bundles.ts`, `export-demo-dataset.ts`) that must pass before any byte is copied; aborts the run if a bundle on disk doesn't match its source.
- **Copy loop** — iterates `SHARED_FILES`, resolving each entry's backend path (`THIS_REPO` key) and frontend path (`frontend` key), then either copies, skips (hash match), or reports "would-copy" / "missing-here" depending on flags and state.
- **Regeneration step** — unconditionally runs `npm run regenerate` in the frontend root (unless `--dry`), using inherited stdio so the frontend's own build output is visible.
- **Post-copy hash verification** — re-reads every shared file on both sides after regeneration and fails if any differ, catching reformatting or mutation introduced by the frontend's own tooling.
- **CLI flags** — `--dry` (report-only, no writes, no regeneration) and `--forced` (skip the hash-equality short-circuit, always copy).
- **`fail`** — prints a message to stderr and `process.exit(1)`; used at every guardrail.

## Relationships

- **`scripts/spec-identity.ts`** — provides `SHARED_FILES` (the list of files to sync and their per-side paths), `hashFile` (used for the idempotency check), and `THIS_REPO` (the key into each `SHARED_FILES` entry for this repo's path).
- **`scripts/paired-frontend-path.ts`** — provides `resolveFrontendPath()` (returns the sibling checkout directory, respecting `FRONTEND_PATH` in `.env`) and `DEFAULT_FRONTEND_PATH` (used in the error message when no checkout is found).

## Notes

- **Regeneration is unconditional.** It runs even when zero files were copied, because switching which backend the pair points at can leave the frontend's generated client stale while its `openapi.yaml` already matches. Gating it on "something moved" would silently skip it in that case.
- **Post-copy hash check is deliberately placed after regeneration.** The frontend's `npm run regenerate` ends in `prettier:fix`; if its `.prettierignore` stops excluding the REST contract, the check fires and names the cause.
- **Files are backend-owned by contract.** Only files listed in `SHARED_FILES` may be overwritten in the frontend. Files the two repos keep identical "for convenience" are intentionally excluded and are never touched by this script.
- **`execFileSync` with `stdio: 'inherit'`** is used only for the frontend's `npm run regenerate` call — the script is deliberately transparent about the other repo's build output rather than summarising it.
