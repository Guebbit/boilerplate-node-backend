---
source: scripts/regenerate-artifacts.ts
sha256: 6fc8c0cb8e687d12dad7335659220589051d2e54f4075560e722e3ecc9245085
generated_at: 2026-09-27T13:59:47.303332+00:00
model: ollama:qwen3.8:27b
---

# scripts/regenerate-artifacts.ts

## Purpose
The `npm run regenerate` entry point. Rebuilds every generated artifact in the repo in a fixed, dependency-correct order (typed API client, generated types, docs tables, docker ignore, then the paired-frontend hand-off). Exists as a single script rather than a shell chain because the ordering is non-obvious and needs a maintainable home.

## Key elements
- **`STEPS`** – `readonly Step[]`; the ordered list of npm scripts to run. Each entry carries a `script` name and a one-line `because` explanation printed as progress.
- **`Step`** – interface: `{ script: string; because: string }`.
- **`run(script)`** – executes `npm run <script>` via `execFileSync` with `stdio: 'inherit'` from `REPO_ROOT`; throws on non-zero exit.
- **`REPO_ROOT`** – resolved to `path.resolve(__dirname, '..')`; every child process is pinned to this cwd regardless of where the caller invoked the script.
- **`skipSync`** – boolean derived from `process.argv.includes('--no-sync')`; gates the final `sync:frontend` step.
- **Final `sync:frontend` block** – handled outside the `STEPS` loop because it is conditional: runs only when the paired frontend checkout exists at `resolveFrontendPath()`, and is silently skipped (not fatal) when it does not.

## Relationships
- **`scripts/pairing/paired-frontend-path.ts`** – imports `resolveFrontendPath` and `DEFAULT_FRONTEND_PATH`. Used in the final step to check whether the sibling frontend repo is on disk and to print a helpful "expected at …" hint when it is missing.
- **`.husky/pre-commit`** – invokes this script with `--no-sync` and stages its output, so `npm run complete` only ever *verifies* rather than rebuilds.
- **`docs/api/regenerating.md`** – documented as the human-readable companion to this script.

## Notes
- Order is load-bearing: `gen:api` must run before any step whose tooling imports `@api/schemas.zod`. Do not reorder `STEPS` casually.
- Most outputs (`api/`, `src/types/asyncapi.generated.ts`) are gitignored; the committed exceptions are the contract bundles and the `docs/*` pages rewritten by the `docs:*` steps.
- A solo clone (no paired frontend) can regenerate without error—the sync step is lenient by design. `npm run sync:frontend` in isolation still fails loudly if the target is absent.
- The script is a `tsx` shebang; it is not a transpiled dependency of any other module.
