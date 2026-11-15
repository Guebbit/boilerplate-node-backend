---
source: scripts/regenerate-artifacts.ts
sha256: 3021eb971df05a82d90691fb3af8bfe3787d130852c9aa943e61da6afe9fe950
generated_at: 2026-11-14T17:39:21.618864+00:00
model: ollama:qwen3.8:27b
---

# scripts/regenerate-artifacts.ts

## Purpose

The single entry point for `npm run regenerate`. It rebuilds every generated artifact (API client, zod schemas, authorization bundle, docs tables, crontab, Dockerfile.dockerignore, etc.) in the one order that satisfies their cross-dependencies. In `--check` mode it verifies artifacts against their sources without writing, serving as the first half of `npm run check`.

## Key elements

- **`STEPS: readonly Step[]`** — The ordered chain of 14 regeneration steps (scenario registries → authorization bundle → permission vocabulary → shared rules → contracts bundle → gen:api → gen:asyncapi → module graph → role matrix → dependency map → rate-limit budgets → scheduled jobs → audit actions → Dockerfile.dockerignore). Each entry carries a `checks` flag indicating whether the step supports `--check`.
- **`Step` interface** — `{ name, command, checks, because }`. `command` is the executable + args; `because` is a one-line human-readable justification shown during the run.
- **`run(command)`** — Executes a step via `execFileSync` with `stdio: 'inherit'` and `cwd: REPO_ROOT`, so each step's own output doubles as the progress report.
- **`handOver()`** — Final step (only in non-check mode). Runs `npm run sync:frontend` to hand rebuilt files to the paired frontend repo. Skipped when `--no-sync` is set or the frontend path doesn't exist on disk.
- **CLI flags** — `--no-sync` (read via `hasFlag`) skips the frontend handover; `--check` filters to only steps with `checks: true` and appends `--check` to their commands.

## Relationships

- **`scripts/cli.ts`** — Imports `hasFlag` to detect the `--no-sync` flag.
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT`, used as the `cwd` for every child process so paths resolve correctly regardless of the caller's working directory.
- **`scripts/pairing/paired-frontend-path.ts`** — Imports `resolveFrontendPath` and `DEFAULT_FRONTEND_PATH` to locate the sibling frontend checkout and decide whether to hand over files.

## Notes

- **Order is load-bearing.** `api/` (gen:api) must exist before the bundler loads the kernel; the authorization bundle and shared rules must exist before any step that boots the app. The `because` field on each step documents *why* it sits where it does.
- **`--check` is asymmetric.** Steps marked `checks: false` (`gen:permission-vocabulary`, `gen:api`, `gen:asyncapi`) are entirely skipped in check mode rather than run with `--check`.
- **Frontend sync is lenient.** A missing paired repo is a warning, not an error — a solo clone must be able to regenerate. The dedicated `npm run sync:frontend` still fails loudly when the path is absent.
- **The script never stages or modifies git state.** `.husky/pre-commit` invokes it with `--no-sync` and then separately refuses a commit if committed generated files are stale.
- **Docs tables are generated in-place.** Several steps rewrite tables in committed Markdown (module graph, role matrix, rate-limit budgets, jobs, audit actions) rather than producing separate files.
