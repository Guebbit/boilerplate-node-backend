---
source: scripts/pairing/check-spec-identity.ts
sha256: 5019993009445db4be04fddd991ce7c544c76b55790ea6ed5343ea6983812015
generated_at: 2026-09-23T17:31:03.006365+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/check-spec-identity.ts

## Purpose

CLI entry point (run via `npm run check:spec-identity`) that verifies the shared contract files between this repo and its paired frontend checkout are byte-identical. It exists to catch contract drift in CI and locally, acting as the backend half of a symmetric pair-check (the frontend runs the mirror against `BACKEND_PATH`).

## Key elements

- **Linear CLI script** (no named exports) — resolves the sibling path, compares files, prints a result, and exits.
- **Exit-code protocol** (the documented interface):
    - `0` — files identical, _or_ sibling absent on a developer's machine (check skipped with a warning).
    - `1` — one or more shared files differ, or a shared file is missing on one side.
    - `2` — sibling checkout not found _and_ `CI` is set (environment misconfiguration, not a contract fork).
- **Optional `.env` load** — `process.loadEnvFile()` is wrapped in a try/catch so a missing `.env` never aborts the script; `FRONTEND_PATH` may instead come from the real environment (as it does in CI).
- **Sibling-absence branch** — if `resolveFrontendPath()` points at a path that doesn't exist, the script prints guidance and exits `0` locally or `2` under `CI`.

## Relationships

- **`scripts/pairing/paired-frontend-path.ts`** — provides `resolveFrontendPath()` (locates the sibling checkout) and `DEFAULT_FRONTEND_PATH` (used in the error message to tell the developer where to clone).
- **`scripts/pairing/spec-identity.ts`** — provides the domain logic: `compareSharedFiles(siblingRoot)` performs the actual file-by-file comparison; `formatSharedFileProblems(comparisons, root)` turns results into a human-readable diff summary; `SHARED_FILES` is the canonical list of contract files to check; `THIS_REPO` labels this side in output.

## Notes

- **Exit 2 ≠ Exit 1.** The split is intentional: `1` means "your contracts forked," `2` means "your environment is wrong." This lets CI fail differently (e.g., a workflow config bug) versus a real regression.
- **Leniency is local-only.** A missing sibling is a `console.warn` + exit 0 outside CI, but a hard exit 2 inside CI — the one place where leniency could mask a real fork.
- **No output on success beyond one line.** The "identical" path prints a single `[spec-identity]` line; there is no per-file listing. Consumers should rely on the exit code, not stdout parsing.
- **Wired into `ci.yml`** (which checks out the sibling first and passes `FRONTEND_PATH`) and into `npm run complete`. The frontend repo runs the mirror-image script against `BACKEND_PATH`.
