---
source: scripts/pairing/check-spec-identity.ts
source_sha256: 6e60ea6dcde9fecad3550e9e1c93a1e4ef1dc6a4682c05e5d8efd3ea9d1ad60a
context_sha256: 0196f34532ee90ea41a6d0e718c27a77a480bd0e0cdda6afd2466c6001c2838b
generated_at: 2026-11-22T02:12:13.520670+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/pairing/check-spec-identity.ts

## Purpose
CLI entry point for the cross-repo contract check (`npm run check`). It compares the shared contract files in this repo against the paired frontend checkout and fails if they have drifted. It is wired into `ci.yml`, which checks the sibling out first and passes `FRONTEND_PATH`, and into `npm run complete`. The frontend runs the mirror image of this check against `BACKEND_PATH`.

## Key elements
This is a top-level script with no exports. It runs these steps in order:

- **`siblingRoot`**: the frontend checkout path, from `resolveFrontendPath()`. The source is the shell's `FRONTEND_PATH`, then `.env`'s, then the default.
- **Missing-sibling guard**: if `siblingRoot` does not exist, it prints a message naming the path and the number of shared files.
  - Under `CI` it exits **2**.
  - Otherwise it warns "SKIPPED" and exits **0**.
- **`comparisons`**: the result of `compareSharedFiles(siblingRoot)`, one verdict per shared file (identical, forked, or missing on a side).
- **`problems`**: the report from `formatSharedFileProblems(comparisons, siblingRoot)`. It is empty when the pair agrees.
- **Final result**: if `problems` is non-empty, it prints the report to stderr and exits **1**. Otherwise it logs that all `SHARED_FILES.length` files are identical, including `THIS_REPO`.

## Relationships
- **`paired-frontend-path.ts`**: supplies `resolveFrontendPath()` and `DEFAULT_FRONTEND_PATH`. The default appears in the "clone it beside this repo" hint.
- **`spec-identity.ts`**: supplies `compareSharedFiles`, `formatSharedFileProblems`, `SHARED_FILES` and `THIS_REPO`. It holds the comparison logic. This file only handles the CLI and exit codes.

## Notes
- **Exit codes are the interface**:
  - `0`: identical, or the sibling is absent on a developer machine.
  - `1`: the contracts have forked, or a shared file is missing on one side.
  - `2`: the sibling is missing under `CI`.
- Exit `2` is separate from `1` because it signals an environment or workflow misconfiguration, not a contract problem.
- Leniency for a missing sibling applies only locally. Under `CI` it is fatal, because skipping there could hide a real fork.
