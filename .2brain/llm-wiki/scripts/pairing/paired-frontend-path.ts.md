---
source: scripts/pairing/paired-frontend-path.ts
source_sha256: a9e3fc104585b43bfa6bac9c809b077d7d30134e7232a76db59e8daf850f1d78
context_sha256: bae061e66c2cdc9cf9e1169faeb9adbd46bd11888df61e091f01b44d625597d4
generated_at: 2026-11-22T02:12:31.337177+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/pairing/paired-frontend-path.ts

## Purpose
Single source of truth for locating the paired frontend checkout (a sibling repo of this backend). Every pairing script resolves the frontend through this file so they all agree on which checkout is meant, regardless of whether `.env` was loaded by `npm run` (it isn't).

## Key elements
- `DEFAULT_FRONTEND_PATH` — `'../boilerplate-vue-frontend'`, the default sibling-checkout location relative to this repo's root. Its comment says it mirrors a counterpart file in the frontend repo that resolves this repo from the other side.
- `frontendPathFromEnvironmentFile()` (private) — reads `FRONTEND_PATH` from `.env` in `process.cwd()` using `parseEnv`. It returns `undefined` if no `.env` exists.
- `resolveFrontendPath()` — returns an absolute path to the frontend checkout. The first non-empty (trimmed) value wins, in this order:
  1. `FRONTEND_PATH` in the real environment
  2. `FRONTEND_PATH` in `.env`
  3. `DEFAULT_FRONTEND_PATH`

  It resolves relative to `process.cwd()` and does not check that anything exists at the result.

## Relationships
The neighbor files are only listed as related through the dependency graph. The file itself shows no imports from or calls to them. By its own comments, the callers include the contract check and the sync, which are presumably `scripts/pairing/check-spec-identity.ts` and `scripts/pairing/sync-to-frontend.ts`. The other neighbors (`scripts/docs/check-references.ts`, `scripts/regenerate-artifacts.ts`) are not described in this file. `tests/unit/scripts/pairing/paired-frontend-path.test.ts` is its unit test.

## Notes
- Empty values count as unset. `.env-example` declares `FRONTEND_PATH =` with no value, so a copied `.env` defines it as `''`. With `??` alone, that would resolve to this repo's own root and compare the backend against itself. The code uses `||` after `trim()` for this reason.
- The default must stay in sync with the corresponding path-resolution convention in the frontend repo (each repo assumes the other sits beside it). If only one side changes, the contract check breaks in one direction only, which is harder to diagnose.
- `parseEnv` is used instead of `process.loadEnvFile()` so that reading one variable does not merge the rest of `.env` into the environment of processes this script spawns later.
- The `.env` file is checked with `existsSync` rather than a try/catch, because a checkout without `.env` is normal (CI has none).
- `.env` is read from `process.cwd()`, not from the script's location.
