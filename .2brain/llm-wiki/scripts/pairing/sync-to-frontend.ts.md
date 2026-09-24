---
source: scripts/pairing/sync-to-frontend.ts
sha256: 686d8ad852578924c3120f905477ef535e447cb0f8463ff86f1d20dd3b96c022
generated_at: 2026-09-23T17:31:38.781653+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/sync-to-frontend.ts

## Purpose
CLI script (`npm run sync:frontend`) that copies every backend-owned shared file into the paired frontend checkout, after verifying the source files are up-to-date, and then triggers the frontend's typed-client regeneration so both repos remain in a consistent state.

## Key elements
- **`STALENESS_GATES`** — Array of `npx tsx …` commands (currently one: `scripts/contracts/build-bundles.ts --check`) executed before any copy. If a gate fails, the script exits without writing anything.
- **Copy loop over `SHARED_FILES`** — For each entry, resolves the backend path (`shared[THIS_REPO]`) and the frontend path (`shared.frontend`), then either copies, skips (identical hash), reports `would-copy` (dry-run), or flags `missing-here`.
- **`Outcome` / `state`** — Discriminated union (`copied | already-identical | would-copy | missing-here`) used to build the console report and to decide whether to fail on missing sources.
- **`regenerate` step (unconditional when not `--dry`)** — Runs `npm run regenerate` in the frontend root with `stdio: 'inherit'`. Deliberately not gated on whether anything was copied (see Notes).
- **Post-copy hash verification** — Re-reads both sides of every shared file and `fail`s if they differ, catching mid-run rewrites (e.g. a `prettier:fix` inside the frontend's regenerate pipeline).
- **`fail(message)`** — Prints to `stderr` and calls `process.exit(1)`.
- **CLI flags** — `--dry` (no writes, no regenerate) and `--forced` (skip the identical-hash short-circuit; always copy).

## Relationships
- **`scripts/pairing/spec-identity.ts`** — Provides `SHARED_FILES` (the authoritative list of what to sync and where each side lives), `hashFile` (byte-comparison), and `THIS_REPO` (the key into each `SHARED_FILES` entry that points at this backend repo's path).
- **`scripts/pairing/paired-frontend-path.ts`** — Provides `resolveFrontendPath()` (where the frontend checkout lives) and `DEFAULT_FRONTEND_PATH` (used in the "no checkout found" error message).

## Notes
- **Regeneration is unconditional (unless `--dry`).** It is *not* gated on `moved.length > 0` because switching which backend the pair points at can leave the frontend's generated clients stale even when the shared files are already byte-identical. Running it when nothing moved is a cheap no-op; skipping it silently ships clients for the wrong contract.
- **Post-copy check runs *after* regeneration.** The frontend's `regenerate` pipeline ends in `prettier:fix`; if a shared document were (incorrectly) reformatted by it, the two repos would fork while all backend-side checks still pass. The final hash comparison is the safety net.
- **`stdio: 'inherit'` on the regenerate `execFileSync`** is deliberate so the reader sees the frontend's own build output and can identify which of *its* steps failed.
- **No exports.** The file is a standalone `tsx` script; its "interface" is the console output and the exit code.
- **`--forced`** bypasses the hash comparison but does *not* bypass the staleness gates or the regeneration step.
