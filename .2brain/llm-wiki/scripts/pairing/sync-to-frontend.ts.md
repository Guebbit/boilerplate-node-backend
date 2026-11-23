---
source: scripts/pairing/sync-to-frontend.ts
source_sha256: d8bbb529bd161afbb83fc252f69b95027448e3f2037c95f9c86cdce54b5469ad
context_sha256: 5ec4af22e762fe0841fa53b91c8a4fe2c914af59a246eb6edd78db058e3e2d5f
generated_at: 2026-11-22T02:13:02.104002+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/pairing/sync-to-frontend.ts

## Purpose
Run via `npm run sync:frontend`. Copies every backend-owned shared file (listed in `SHARED_FILES`) into the paired frontend checkout, then regenerates the frontend's typed clients so both repos stay consistent. The backend owns these files, so the frontend's copy is purely an output and may be overwritten.

## Key elements
- **Flags** (via `hasFlag`): `--dry` reports what would be copied and writes nothing (including skipping regeneration). `--forced` copies even when the hashes already match.
- **`fail(message)`**: prints to stderr and exits with code 1.
- **`frontendRoot`**: from `resolveFrontendPath()`. The script fails if the directory doesn't exist.
- **`STALENESS_GATES`**: commands run before any copy. Currently only a `--check` run of the contract bundle build script. Any failure aborts with "Nothing was written".
- **`Outcome` / `outcomes`**: for each `SHARED_FILES` entry, the state is `copied`, `already-identical` (by `hashFile`), `would-copy`, or `missing-here`. Missing parent directories on the frontend side are created.
- **`of(state)` / `list(items)`**: filter outcomes and format them as `from -> to` lines.
- **Regeneration**: runs `npm run regenerate` in the frontend with inherited stdio.
- **Post-copy verification**: compares bytes of each shared file on both sides after regeneration.

## Relationships
- `./spec-identity`: supplies `SHARED_FILES` (per-side paths), `THIS_REPO` (the key for this side's path), and `hashFile`.
- `./paired-frontend-path`: `resolveFrontendPath()` locates the frontend checkout. `DEFAULT_FRONTEND_PATH` is used in the error message.
- `./linked-worktree`: `writesIntoMainFromWorktree(cwd, frontendRoot)` blocks writes from a linked backend worktree into the frontend's main checkout.
- `../cli`: provides `hasFlag` for `--dry` and `--forced`.

## Notes
- **Worktree guard**: a linked worktree must sync into its own paired frontend worktree (via `FRONTEND_PATH`). Frontend main takes contracts only from backend main. `--dry` bypasses the guard.
- **Regeneration always runs on a real run**, even when nothing was copied. Switching the backend a frontend pairs with can leave its generated client stale while the copied files already match. It is deliberately not a flag.
- **Failure after copying**: if regeneration fails, the copy stands and the error message gives manual recovery steps (`npm run regenerate`, `npm run check`).
- **Final byte-equality check** runs after regeneration to catch rewrites. The frontend's `regenerate` ends in `prettier:fix`, so the frontend's `.prettierignore` must exclude the shared REST contract.
- A shared file missing on the backend side is fatal. Fix it by building the file or removing it from `SHARED_FILES`.
- The script runs top-level on import. There are no exported functions.
