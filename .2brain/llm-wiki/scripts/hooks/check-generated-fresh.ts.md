---
source: scripts/hooks/check-generated-fresh.ts
source_sha256: 916f5de80f1dba227523847bfd9e8ebbbf9633c75b2bc366336c90e294c8359a
context_sha256: f97a7b15ef260807422ca3cbce872a2de8c13dd19958dcdd2f7accae98489ffa
generated_at: 2026-11-22T02:06:59.112549+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/hooks/check-generated-fresh.ts

## Purpose
A pre-commit check (`npm run check:generated`, run by `.husky/pre-commit`) that refuses a commit when committed generated files are stale. It only checks. It never stages files and never writes into the working tree. The files in scope are whatever `regenerate` writes that is not gitignored. Examples are the shared-rules schemas, `shared/authorization-keys.generated.yaml`, `docker/crontab`, and the tables inside `docs/`.

## Key elements
- `regenerateIn(tree)`: callback that regenerates inside a scratch copy of the index.
  - It symlinks this checkout's `node_modules` into `tree`.
  - It then runs `npx tsx scripts/regenerate-artifacts.ts --no-sync` with `cwd: tree` and `env: gitEnvironment()`.
  - It uses `stdio: 'pipe'`, so output is held back and shown only if the run fails. A non-zero exit throws.
- `stale`: the result of `staleGeneratedFiles({ repo: REPO_ROOT, regenerate: regenerateIn })`. It lists the files a regeneration would change in what is being committed.
- Top-level flow:
  - If `stale` is non-empty, the script prints each stale file to stderr, tells the user to run `npm run regenerate` and stage the results, and exits with code 1.
  - Otherwise it logs `[generated] every committed generated file is current.`

## Relationships
- `scripts/hooks/stale-generated-files.ts`: provides `staleGeneratedFiles`, the core logic. This file supplies the repo root and the regeneration callback, and consumes the list of stale files.
- `scripts/git-base.ts`: provides `gitEnvironment()`, used as the environment for the regeneration subprocess.
- `scripts/modules-on-disk.ts`: provides `REPO_ROOT`. It is used as the repo to check and as the source of the `node_modules` directory that is symlinked into the scratch tree.

## Notes
- Regeneration uses `--no-sync`, so the frontend is not synced.
- The check runs against a scratch copy of the index, so it reflects what is being committed, not the working tree.
- It has no output or error handling beyond the `stale` report. A regeneration failure surfaces as a thrown `execFileSync` error that carries the piped output.
- The fix is manual: run `npm run regenerate` and stage the results.
