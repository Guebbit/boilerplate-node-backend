---
source: scripts/pairing/sync-to-frontend.ts
sha256: a3ca937a5fb6ebfd7d95176b75611bf5511b2c4b99709a0bdbe80d0bc3359058
generated_at: 2026-10-29T01:41:06.928197+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/sync-to-frontend.ts

## Purpose

Copies every backend-owned shared file into the paired frontend checkout so the two repos stay byte-identical on those files. It validates staleness first, performs the copy (or skips it if already identical), regenerates the frontend's typed clients, and verifies the result — all in one `npm run sync:frontend` invocation.

## Key elements

- **`dryRun` / `forcedRun` / `regenerate`** — Three behavioral switches derived from CLI flags (`--dry`, `--forced`) and a constant (`!dryRun`). `--dry` reports without writing; `--forced` copies even if hashes match; `regenerate` is always on unless `--dry` is set.
- **`fail(message)`** — Logs to stderr and exits with code 1; returns `never`.
- **`frontendRoot`** — Resolved via `resolveFrontendPath()`; the script aborts if the path doesn't exist.
- **Worktree guard** — Calls `writesIntoMainFromWorktree` to refuse writing into the frontend's *main* checkout when the backend is a linked worktree.
- **`STALENESS_GATES`** — An array of child-process checks (currently: contract-bundle `--check`) that must pass before any byte is copied.
- **`Outcome` interface & `outcomes` array** — The core copy loop over `SHARED_FILES`; classifies each file as `copied`, `already-identical`, `would-copy`, or `missing-here`.
- **`of()` / `list()`** — Small report helpers that filter and format outcomes for console output.
- **Missing-file check** — Any `missing-here` outcome is fatal (broken build or stale list).
- **Regeneration step** — Runs `npm run regenerate` in the frontend with inherited stdio; unconditional so it also catches drift when no file actually changed.
- **Post-copy hash verification** — Re-reads both sides after regeneration and fails if they diverge (guards against prettier or other post-processing rewriting a shared file).

## Relationships

- **`scripts/cli.ts`** — Imports `hasFlag` to read `--dry` and `--forced` from the shared CLI flag parser.
- **`scripts/pairing/linked-worktree.ts`** — Imports `writesIntoMainFromWorktree` to enforce the rule that a backend worktree must not write into the frontend's main checkout.
- **`scripts/pairing/paired-frontend-path.ts`** — Imports `resolveFrontendPath` and `DEFAULT_FRONTEND_PATH` to locate where the copy lands (shell env → `.env` → sibling default).
- **`scripts/pairing/spec-identity.ts`** — Imports `SHARED_FILES` (the authoritative list of paired files with per-side paths), `hashFile` (content hashing for skip/verify), and `THIS_REPO` (the key selecting the backend-side path).

## Notes

- **Regeneration is deliberately unconditional.** It is not gated on `moved.length > 0` because switching the paired backend can leave a stale generated client even when `openapi.yaml` already matches byte-for-byte (nothing to copy). The cost of a no-op regeneration is far lower than shipping a client for the wrong contract.
- **Post-copy verification runs *after* regeneration** on purpose: the frontend's `regenerate` pipeline ends with `prettier:fix`, which could reformat a shared document and silently fork the repos. The check catches exactly that.
- **Staleness gates use `stdio: ['ignore','ignore','pipe']`** (only stderr captured) while the regeneration step uses `stdio: 'inherit'` so the reader sees the other repo's own error output.
- **A missing shared file is fatal, not a warning.** It signals either a failed build or a stale `SHARED_FILES` entry; continuing would copy a partial contract.
