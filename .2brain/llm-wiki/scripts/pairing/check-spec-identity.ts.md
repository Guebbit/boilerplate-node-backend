---
source: scripts/pairing/check-spec-identity.ts
sha256: d3344bc57f978ab0401538537e0b88952daa7f1648082c965c7b02cee2b6e9e3
generated_at: 2026-10-14T07:29:14.889497+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/check-spec-identity.ts

## Purpose

CLI entry point (`npm run check:spec-identity`) that verifies the shared contract files in this repo are byte-identical to their counterparts in the paired frontend checkout. It exists so CI can detect contract drift between the two repositories before it becomes a runtime bug.

## Key elements

- **Top-level flow** – Resolves the sibling path, guards on its existence, runs the comparison, and prints a verdict. There are no exported functions; the file *is* the script.
- **`siblingRoot`** – Resolved once via `resolveFrontendPath()`. Drives every subsequent path reference.
- **Missing-sibling guard** – If `existsSync(siblingRoot)` is false the script exits immediately: `0` (warn + skip) on a local dev machine, `2` (error) when `process.env.CI` is set.
- **Comparison + reporting** – `compareSharedFiles(siblingRoot)` produces one verdict per shared file; `formatSharedFileProblems(comparisons, siblingRoot)` turns non-identical results into a human-readable string. Any non-empty result → `exit 1`.
- **Success path** – Logs how many files matched and the resolved sibling root.

## Relationships

- **`scripts/pairing/spec-identity.ts`** – Supplies `SHARED_FILES` (the list of files to compare), `THIS_REPO` (repo label used in messages), and the two workhorse functions `compareSharedFiles` / `formatSharedFileProblems`. This file contains no comparison logic of its own.
- **`scripts/pairing/paired-frontend-path.ts`** – Provides `resolveFrontendPath()` (shell `FRONTEND_PATH` → `.env` → default) and `DEFAULT_FRONTEND_PATH` (used in the "clone it beside this repo" hint). This file never touches the filesystem directly to locate the sibling; it delegates entirely to that module.

## Notes

- **Exit-code contract is the API.** `0` = pass, `1` = contract drift, `2` = environment problem (sibling missing under CI). Consumers (`ci.yml`, `npm run complete`) branch on these codes, so changing them is a breaking change.
- **CI vs. local leniency.** A missing sibling is *skipped* locally (exit 0) but *fatal* in CI (exit 2). The distinction exists because `ci.yml` is expected to check out the sibling itself; a miss there means a broken workflow, not a half-set-up dev machine.
- **The frontend runs the mirror.** The docblock states the frontend repo has an equivalent script that compares against `BACKEND_PATH`. Keeping both sides in sync is a manual process (see `docs/tools/pairing-and-ports.md#keeping-the-pair-in-step`).
- **Shebang is `#!/usr/bin/env tsx`**, so the file is plain TypeScript executed by `tsx`—no compile step.
