# scripts/check-spec-identity.ts

## Purpose

CLI entry point for `npm run check:spec-identity`: verifies that a set of shared contract files in this repo are byte-identical to their counterparts in the paired frontend checkout. It is invoked by `ci.yml` and `npm run complete`, and the frontend repo mirrors this script.

## Key elements

- **Exit-code contract** — the script's sole interface to callers:
  - `0` — files identical, *or* sibling absent on a developer machine (skip).
  - `1` — at least one shared file has diverged, or a shared file is missing on one side.
  - `2` — sibling checkout not found **and** `CI` is set (environment misconfiguration).
- **`process.loadEnvFile()` (guarded)** — attempted before path resolution so a local `.env` can supply `FRONTEND_PATH`; a missing/unreadable `.env` is silently ignored because CI supplies the variable in-process.
- **Sibling-existence gate** — calls `existsSync(siblingRoot)` and branches on `process.env.CI` to decide between a lenient skip and a hard failure.
- **Comparison block** — delegates to `compareSharedFiles(siblingRoot)` and `formatSharedFileProblems(comparisons, siblingRoot)`; prints the result and exits accordingly.

## Relationships

- **`scripts/paired-frontend-path.ts`** — supplies `resolveFrontendPath()` (returns the absolute path to the sibling checkout) and `DEFAULT_FRONTEND_PATH` (used in the "not found" hint message).
- **`scripts/spec-identity.ts`** — supplies the actual diffing logic (`compareSharedFiles`, `formatSharedFileProblems`) plus the constants `SHARED_FILES` (list of files to compare) and `THIS_REPO` (label for success messages).

## Notes

- Exit code `2` is deliberately distinct from `1`: it signals an *environment* problem (no sibling where one should exist) rather than a *contract* divergence. Conflating the two would let a misconfigured CI run masquerade as a passing or failing contract check.
- The `.env` `try/catch` is intentional — in CI the `FRONTEND_PATH` variable arrives via the workflow environment, not a file, so a missing `.env` is normal.
- The script is a thin orchestrator; all comparison semantics live in `spec-identity.ts`. Editing this file rarely changes *what* is compared, only *when* and *how loudly* the result is reported.
