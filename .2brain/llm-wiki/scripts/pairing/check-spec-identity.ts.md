---
source: scripts/pairing/check-spec-identity.ts
sha256: 3263655e6deab590c4f5584b232577cbab96ad68d0017f08f618975c4044c78c
generated_at: 2026-10-29T01:40:39.041169+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/check-spec-identity.ts

## Purpose

CLI entry point (`npm run check`) that verifies the shared contract files in this repo are byte-identical to those in the paired frontend checkout. It exists to catch contract drift early—both on a developer's machine and in CI—so that the two repos don't silently fork their shared interfaces.

## Key elements

- **Top-level script (no exports).** Runs directly via `tsx`; the exit code *is* the API.
- **`siblingRoot`** — resolved at startup via `resolveFrontendPath()` (shell → `.env` → default).
- **Absence guard (exit 0 vs 2).** If the sibling checkout doesn't exist, the script exits `0` (skip) on a dev machine but `2` under `CI`, distinguishing an environment misconfiguration from a real contract failure.
- **`compareSharedFiles(siblingRoot)`** — returns a per-file verdict (identical / forked / missing) for every entry in `SHARED_FILES`.
- **`formatSharedFileProblems(comparisons, siblingRoot)`** — renders a human-readable report of all non-identical files, or `null` when everything matches.
- **Exit codes:** `0` identical (or skipped locally) · `1` contracts forked or a shared file is missing on one side · `2` sibling checkout not found in an environment that should have one.

## Relationships

- **`scripts/pairing/paired-frontend-path.ts`** — supplies `resolveFrontendPath` (the resolution chain for the sibling path) and `DEFAULT_FRONTEND_PATH` (used in the diagnostic message shown when the checkout is absent).
- **`scripts/pairing/spec-identity.ts`** — supplies the core comparison logic (`compareSharedFiles`, `formatSharedFileProblems`), the list of files to compare (`SHARED_FILES`), and the identity label for this repo (`THIS_REPO`). This file contains no comparison logic of its own; it is purely the CLI/orchestration layer over those functions.

## Notes

- The frontend repo ships a **mirror image** of this script that runs against `BACKEND_PATH`. The two are not a shared package; they are copies kept in lockstep.
- Exit `2` is deliberately separate from `1`: `2` means "the environment is wrong, we can't even compare," while `1` means "we compared and found drift." CI pipelines can therefore alert on the two conditions differently.
- The script is wired into `ci.yml` (which checks out the sibling and passes `FRONTEND_PATH`) and into `npm run complete`. It is not meant to be imported as a module.
