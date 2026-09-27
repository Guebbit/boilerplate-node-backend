---
source: scripts/pairing/paired-frontend-path.ts
sha256: a9e3fc104585b43bfa6bac9c809b077d7d30134e7232a76db59e8daf850f1d78
generated_at: 2026-09-27T13:59:24.387767+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/paired-frontend-path.ts

## Purpose

Resolves the absolute path to the paired Vue frontend checkout so that every script in this repo that needs to read or write the frontend does so against the same directory. Centralises the lookup logic (environment variable → `.env` → sibling-default) so callers don't each reimplement the fallback chain and risk pointing at different checkouts.

## Key elements

- **`DEFAULT_FRONTEND_PATH`** (exported const) — The sibling-checkout convention: `../boilerplate-vue-frontend`. Must mirror the corresponding constant in the frontend repo's `paired-backend-path.ts`.
- **`frontendPathFromEnvironmentFile`** (internal) — Reads `.env` from the CWD with `node:util`'s `parseEnv` and returns the `FRONTEND_PATH` value, or `undefined` if no `.env` exists. Avoids polluting `process.env` with unrelated keys.
- **`resolveFrontendPath`** (exported function) — Returns the absolute frontend path. Precedence: `process.env.FRONTEND_PATH` → `.env` `FRONTEND_PATH` → `DEFAULT_FRONTEND_PATH`. Empty/whitespace-only values are treated as unset (uses `||` + `trim()`, not `??`).

## Relationships

- **`scripts/pairing/sync-to-frontend.ts`** — Consumes `resolveFrontendPath` to determine the destination directory for syncing backend artifacts into the frontend.
- **`scripts/pairing/check-spec-identity.ts`** — Consumes `resolveFrontendPath` to locate the frontend's spec files for the identity comparison.
- **`tests/unit/scripts/pairing/paired-frontend-path.test.ts`** — Unit-tests the resolution fallback chain and the empty-string edge case.
- **`tests/cross-cutting/frontend-pairing.test.ts`** — Exercises the full pairing flow (check + sync) that depends on this module's output.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — Indirectly depends on the resolved path when it sets up fixtures for the identity check.

## Notes

- **Empty-string trap:** `.env-example` ships `FRONTEND_PATH =` (no value), so a copied `.env` defines it as `''`. `??` would treat that as "set" and resolve to the repo's own root. The code uses `||` + `trim()` to fall through to the next source.
- **Two-repo contract:** `DEFAULT_FRONTEND_PATH` here and `DEFAULT_BACKEND_PATH` in the frontend repo must agree on the sibling layout. Changing one without the other breaks the contract check in only one direction.
- **CI assumption:** CI checkouts have no `.env`, so `frontendPathFromEnvironmentFile` returns `undefined`; the env-var or default path is what CI actually uses.
- **`.env` reading convention:** This module is the single point that reads `.env` for `FRONTEND_PATH`. Downstream CLIs should call `resolveFrontendPath()` rather than parsing `.env` themselves, so all scripts in a lane agree on which frontend they target.
