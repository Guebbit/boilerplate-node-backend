---
source: scripts/regenerate-artifacts.ts
source_sha256: 55ed0412de49407a59eb867dcc2e1415cb9d159352b3a7e66554e5f79a31b715
context_sha256: 05ec23075ad3965dc58f1b793eef549269d8aa47032fcc4e588e2ed215fd4a99
generated_at: 2026-11-22T02:13:20.910226+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/regenerate-artifacts.ts

## Purpose
Entry point for `npm run regenerate`. It rebuilds every generated artifact (API clients, zod schemas, bundles, `*.generated.ts` files, and the docs tables and crontab that generators rewrite) by running a fixed sequence of commands. It is a script rather than a `&&` chain because the order is non-obvious. The main constraint is that the app's models import `@api/schemas.zod`, so `api.generated/` must exist before anything that imports module code runs. With `--check` it only verifies, as the first half of `npm run check`. It never stages files.

## Key elements
- `STEPS`: the ordered list of `Step` entries. Each has a `name`, a `command` tuple, a `checks` flag (whether the command accepts `--check`) and a `because` line explaining what it produces and what it must follow. In order, the steps are:
  1. scenario registries
  2. authorization bundle
  3. `gen:permission-vocabulary`
  4. shared rules
  5. `contracts:bundle`
  6. `gen:api`
  7. `gen:asyncapi`
  8. module graph
  9. role matrix
  10. dependency map
  11. rate-limit budgets
  12. scheduled jobs
  13. audit actions
- `Step`: the interface for one chain entry.
- `skipSync` / `checkOnly`: flags read from `--no-sync` (via `hasFlag`) and `--check` (via `process.argv`).
- `run(command)`: runs one command with `execFileSync`, `cwd: REPO_ROOT` and inherited stdio, so the child's output is the progress report. A non-zero exit throws.
- `steps`: `STEPS`, or only the steps with `checks: true` under `--check`.
- Main loop: prints `[regenerate] i/N name` and the step's `because`, then runs the step. Under `--check` it appends `--check` to the command.
- `handOver()`: the final "sync:frontend" step, which hands backend-owned files to the paired frontend repo.

## Relationships
- `scripts/cli.ts`: supplies `hasFlag`, used to read `--no-sync`.
- `scripts/modules-on-disk.ts`: supplies `REPO_ROOT`, the working directory for every spawned command.
- `scripts/pairing/paired-frontend-path.ts`: supplies `resolveFrontendPath()` and `DEFAULT_FRONTEND_PATH`. They are used to check that the sibling frontend checkout exists and to name where it was expected.
- Spawned steps (not graph neighbors): `scripts/docs/*`, `scripts/contracts/*` and the npm scripts `gen:*` and `sync:frontend`.

## Notes
- Steps with `checks: false` (the three npm-script steps: `gen:permission-vocabulary`, `gen:api`, `gen:asyncapi`) are skipped entirely under `--check`.
- The final step is `sync:frontend`, and it only runs on a write run. `--check` writes nothing and hands nothing over.
- `handOver()` is skipped, not fatal, when `--no-sync` is set or the frontend checkout is missing. A solo clone can still regenerate. The missing-checkout message points to `FRONTEND_PATH` in `.env`. Running `npm run sync:frontend` directly still fails loudly.
- The progress counter is `index + 1 / steps.length + 1`, because the sync step counts as the last step.
- `.husky/pre-commit` runs it with `--no-sync`, then refuses a commit whose committed generated files are stale (`npm run check:generated`).
- Client collections read `scenarios/subjects.ts` and are not committed, so they are not a step.
- Most outputs are gitignored. The committed exceptions are the shared-rules schemas, the authorization keys, the crontab and the docs tables.
- The first four steps exist to satisfy boot-time imports: the scenario registries (`scenarios/*.generated.ts`), the authorization keys read by the kernel's permissions module at boot, the generated permission vocabulary in `api.generated/`, and the generated audit-actions file built from a rules file. The bundler loads the kernel, so these must exist before the first bundle on a clean checkout.
