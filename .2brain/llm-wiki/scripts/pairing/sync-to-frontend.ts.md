---
source: scripts/pairing/sync-to-frontend.ts
sha256: ffb92bd0147b4b564f3b1455625218bdea7dea178c6cd8384cfca3abbed5a446
generated_at: 2026-10-14T07:29:59.250987+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/sync-to-frontend.ts

## Purpose

Covers the `npm run sync:frontend` entry point. It copies every backend-owned shared file (as declared in `SHARED_FILES`) into the paired frontend checkout, after verifying the files are freshly built, and then triggers the frontend's own `npm run regenerate`. It exists so a single command leaves both repos consistent rather than relying on a developer to remember each side's follow-up step.

## Key elements

- **`STALENESS_GATES`** – Array of child-process checks (currently `build-bundles.ts --check`) that must pass before any byte is copied. A failure aborts the run with the gate's stderr.
- **`Outcome` / `outcomes`** – Per-file record (`copied` | `already-identical` | `would-copy` | `missing-here`) produced by mapping over `SHARED_FILES`. `missing-here` is fatal; the rest are reported.
- **`fail(message)`** – Writes to stderr and exits 1. Used for every unrecoverable condition.
- **`regenerate` step** – Unconditionally runs `npm run regenerate` in the frontend (skipped only under `--dry`). Deliberately *not* gated on whether a copy occurred, because switching backend pair can leave a stale generated client even when `openapi.yaml` is byte-identical.
- **Post-copy hash re-verification** – After regeneration, re-reads every shared file on both sides and fails if they diverge (catches a `prettier:fix` or other rewrite inside the frontend's build).
- **CLI flags** – `--dry` (report-only, no writes on either side) and `--forced` (skip the already-identical hash check).

## Relationships

- **`scripts/pairing/spec-identity.ts`** – Imports `SHARED_FILES` (the list of files and their per-side paths), `hashFile` (byte-comparison), and `THIS_REPO` (key into `SHARED_FILES` entries for the backend path). This script is a consumer of that registry; adding a file to `SHARED_FILES` requires no edit here.
- **`scripts/pairing/paired-frontend-path.ts`** – Imports `resolveFrontendPath` (resolves `FRONTEND_PATH` from shell env, `.env`, or sibling default) and `DEFAULT_FRONTEND_PATH` (used in the "no checkout found" error).
- **`scripts/pairing/linked-worktree.ts`** – Imports `writesIntoMainFromWorktree`. When the current backend is a linked worktree, the script refuses to write into the frontend's *main* checkout, forcing the pair to target the corresponding frontend worktree instead.

## Notes

- Regeneration is unconditional by design. An opt-in flag was considered and rejected: the one script whose job is consistency should not need a reminder to use its own step.
- The post-copy re-verification runs *after* regeneration, not before, specifically to detect a `prettier:fix` (or similar) inside the frontend's `regenerate` script reformatting a shared document. The frontend's `.prettierignore` is expected to exclude the REST contract; this check is the tripwire if that ever stops being true.
- A linked worktree may still *read* (`--dry`) the frontend's main checkout; the restriction is write-only.
- `execFileSync` for the staleness gates pipes only stderr (the reason string); the regeneration step inherits all stdio so the frontend's own build output is visible to the operator.
