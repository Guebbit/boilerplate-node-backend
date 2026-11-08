---
source: scripts/regenerate-artifacts.ts
sha256: 7df3d259e91e83d4916c56f41ccb18d318e0eedfdac3f300afd0ec64fa06a644
generated_at: 2026-11-08T02:57:06.479771+00:00
model: ollama:qwen3.8:27b
---

# scripts/regenerate-artifacts.ts

## Purpose

Entry-point script for `npm run regenerate` that rebuilds every generated artifact in the repo in a fixed, dependency-ordered sequence. It exists because the regeneration steps have non-obvious ordering constraints (e.g. `api/` must exist before any step that boots the app) and need a single place to encode that order. Also wired into `.husky/pre-commit` (with `--no-sync`) and used in verify mode via `--check` as the first half of `npm run check`.

## Key elements

- **`STEPS`** — `readonly Step[]` array of 16 generation commands in the only order that works. Each entry carries a `name`, the `command` (array of strings), a `checks` boolean (whether the step supports `--check`), and a one-line `because` explanation printed at runtime.
- **`Step`** (interface) — shape of one entry in `STEPS`: `name`, `command`, `checks`, `because`.
- **`run`** — wraps `execFileSync` with `{ cwd: REPO_ROOT, stdio: 'inherit' }` so each child script's own stdout serves as the progress report.
- **`handOver`** — final step (step 17): runs `npm run sync:frontend` to hand backend-owned files to the paired frontend repo. Skips gracefully (non-fatal) if the sibling checkout is absent or `--no-sync` is set.
- **Flag parsing** — `skipSync` from `hasFlag('no-sync')`; `checkOnly` from `process.argv.includes('--check')`. Under `--check`, only steps with `checks: true` run, each gets `--check` appended, and `handOver` is not called.
- **Steps with `checks: false`** — `gen:permission-vocabulary`, `gen:api`, `gen:asyncapi` (the three `npm run` generators that do not support a verify sub-mode).

## Relationships

- **`scripts/cli.ts`** — imports `hasFlag` to detect `--no-sync` in `process.argv`.
- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` to set the `cwd` for every `execFileSync` call.
- **`scripts/pairing/paired-frontend-path.ts`** — imports `resolveFrontendPath` and `DEFAULT_FRONTEND_PATH` to locate the sibling frontend checkout for the `sync:frontend` handoff and to print a helpful skip message when it is absent.

## Notes

- The `--check` mode is **read-only**: it never writes, never stages, and never invokes `handOver`. It is purely a verification pass.
- Steps marked `checks: false` (the three `npm run gen:*` commands) are **skipped entirely** under `--check`; they cannot self-verify.
- The frontend handoff is deliberately non-fatal: a solo clone (no sibling repo) can still regenerate. `npm run sync:frontend` run in isolation, by contrast, *does* fail loudly.
- `--no-sync` is passed by the husky pre-commit hook so that a commit whose generated files are stale is caught by `check:generated` without accidentally mutating the frontend.
- The script is a standalone `tsx` entry (shebang), not an npm-script alias — the header explains it was chosen over a chain of `&&` to give the ordering a documented home.
- Client collections (`scenarios/subjects.ts`) are intentionally **not** a step here; they are uncommitted and read a different source.
