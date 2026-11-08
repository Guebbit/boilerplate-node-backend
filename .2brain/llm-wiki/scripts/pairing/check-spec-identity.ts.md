---
source: scripts/pairing/check-spec-identity.ts
sha256: 3263655e6deab590c4f5584b232577cbab96ad68d0017f08f618975c4044c78c
generated_at: 2026-11-08T02:56:03.761677+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/check-spec-identity.ts

## Purpose

CLI entry point for the cross-repo contract check (`npm run check`). It compares a set of shared specification files between this (backend) repo and its paired frontend checkout, exiting non-zero if the contracts have drifted. The frontend repo runs the mirror image of this script against `BACKEND_PATH`.

## Key elements

- **`siblingRoot`** — resolved once at the top via `resolveFrontendPath()` (shell `FRONTEND_PATH`, then `.env`, then `DEFAULT_FRONTEND_PATH`).
- **Missing-sibling guard** — if `existsSync(siblingRoot)` is false: exits **0** with a warning on a developer machine; exits **2** under `CI` (environment problem, not a contract problem).
- **`compareSharedFiles(siblingRoot)`** — imported from `spec-identity.ts`; returns one verdict (identical / forked / missing) per entry in `SHARED_FILES`.
- **`formatSharedFileProblems(comparisons, siblingRoot)`** — imported from `spec-identity.ts`; renders a human-readable report of every non-identical file, or `null`/empty when the pair agrees.
- **Exit codes (the public interface):**
  - `0` — files identical, *or* sibling absent locally.
  - `1` — contracts have forked or a shared file is missing on one side.
  - `2` — sibling checkout not found *and* `CI` is set (misconfigured workflow).

## Relationships

- **`scripts/pairing/paired-frontend-path.ts`** — source of `resolveFrontendPath()` and `DEFAULT_FRONTEND_PATH`. This file calls `resolveFrontendPath()` to locate the sibling and references `DEFAULT_FRONTEND_PATH` in its skip/CI messages.
- **`scripts/pairing/spec-identity.ts`** — source of the core comparison logic (`compareSharedFiles`, `formatSharedFileProblems`), the file list (`SHARED_FILES`), and the repo label (`THIS_REPO`). This file is purely the orchestration/shell layer around those exports.

## Notes

- Exit code `2` is intentionally distinct from `1`: it signals an *environment* problem (missing checkout under CI) rather than a *contract* problem, so CI can distinguish "wrong setup" from "real drift."
- Leniency for a missing sibling is **only** on non-CI machines; under `CI` it is fatal because `ci.yml` is expected to have already checked out the sibling and passed `FRONTEND_PATH`.
- The script is a thin orchestration layer — all comparison logic and file-list knowledge lives in `spec-identity.ts`. Modifying the set of checked files means editing that module, not this one.
- Documented cross-reference: `docs/tools/pairing-and-ports.md#keeping-the-pair-in-step`.
