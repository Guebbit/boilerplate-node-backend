---
source: scripts/pairing/check-spec-identity.ts
sha256: f13973f46c3982c3d78e6abc536ef86dd5dfb61529805f5862a135728513f770
generated_at: 2026-09-27T13:59:04.748251+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/check-spec-identity.ts

## Purpose

CLI entry point (`npm run check:spec-identity`) that verifies the shared contract files in this (backend) repo are byte-identical to those in the paired frontend repo. It exists to catch contract drift between the two checkouts during CI or local development, acting as the backend half of a symmetric pair-check.

## Key elements

- **Main flow (top-level script, no exports):** Resolves the sibling path → checks existence → runs the comparison → prints a verdict → exits with a code.
- **`siblingRoot`** — result of `resolveFrontendPath()`, the filesystem path to the frontend checkout to compare against.
- **`comparisons`** — array of per-file verdicts (identical / forked / missing) returned by `compareSharedFiles(siblingRoot)`.
- **`problems`** — human-readable report string (or empty) from `formatSharedFileProblems`; printed to stderr on mismatch.
- **Exit codes:** `0` identical or locally skipped; `1` contracts have diverged or a shared file is missing on one side; `2` sibling checkout not found while `CI` is set.

## Relationships

- **`scripts/pairing/paired-frontend-path.ts`** — provides `resolveFrontendPath()` (locates the sibling via `FRONTEND_PATH` env, `.env`, or a default) and `DEFAULT_FRONTEND_PATH` (used in the "not found" hint message).
- **`scripts/pairing/spec-identity.ts`** — provides all comparison logic: `SHARED_FILES` (the list of files to diff), `THIS_REPO` (label for this side), `compareSharedFiles` (per-file diff), and `formatSharedFileProblems` (rendering of mismatches).

## Notes

- Exit code `2` is deliberately separate from `1`: a missing sibling is an *environment* problem, not a *contract* problem. Locally a missing sibling is lenient (warn + exit 0); under `CI` it is fatal (exit 2) because `ci.yml` is expected to have checked out the sibling and passed `FRONTEND_PATH`.
- The frontend repo runs a mirror-image script that compares against `BACKEND_PATH` instead.
- No functions are exported; the file is a `tsx`-run CLI (see the shebang).
