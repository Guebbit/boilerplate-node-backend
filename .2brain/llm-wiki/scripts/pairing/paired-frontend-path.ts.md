---
source: scripts/pairing/paired-frontend-path.ts
sha256: 2b803ba6dbcdc8d8e1b35c7b73487bf59d834bf06e12665d425df953dc202399
generated_at: 2026-09-23T17:31:12.252167+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/paired-frontend-path.ts

## Purpose

Single source of truth for *where the paired Vue frontend repo lives* relative to this backend repo. It centralises the default sibling-checkout path and the env-var override logic so that every cross-repo script (contract check, sync, identity check) resolves the same directory without each one re-implementing the `FRONTEND_PATH` fallback.

## Key elements

- **`DEFAULT_FRONTEND_PATH`** (`const`, exported) — The relative path (`'../boilerplate-vue-frontend'`) to the sibling frontend checkout. Must stay in sync with the mirrored constant in `<frontend>/scripts/pairing/paired-backend-path.ts`.
- **`resolveFrontendPath()`** (`function`, exported) — Returns an **absolute** path to the frontend repo. Reads `process.env.FRONTEND_PATH`; if set and non-empty after `trim()`, uses it; otherwise falls back to `DEFAULT_FRONTEND_PATH`. Always calls `path.resolve` against `process.cwd()`.

## Relationships

- **scripts/pairing/check-spec-identity.ts** — Consumes `resolveFrontendPath()` to locate the frontend spec files it compares against this repo's backend specs.
- **scripts/pairing/sync-to-frontend.ts** — Uses the resolved path as the target directory for syncing generated artifacts into the frontend checkout.
- **tests/cross-cutting/frontend-pairing.test.ts** — Exercises the pairing contract (likely calls `resolveFrontendPath` or depends on the path it produces).
- **tests/unit/scripts/pairing/spec-identity.test.ts** — Unit-tests the spec-identity logic that depends on the resolved frontend path.
- **scripts/docs/check-references.ts** / **scripts/regenerate-artifacts.ts** — Referenced in the dependency graph; likely import or invoke the pairing scripts that in turn rely on this module's exports.

## Notes

- **Empty-string trap:** `process.env.FRONTEND_PATH` can be `''` (e.g. when `.env-example` declares `FRONTEND_PATH =` with no value). The code deliberately uses `||` instead of `??` so that an empty/whitespace-only value is treated as *unset* and falls through to `DEFAULT_FRONTEND_PATH`. Using `??` would resolve to the repo's own root, making the "cross-repo" check compare the backend against itself.
- **Mirror contract:** Changing `DEFAULT_FRONTEND_PATH` here without updating the counterpart constant in the frontend repo breaks the identity check in exactly one direction (the "confusing half" called out in the source comment).
- The function always returns an **absolute** path; callers should not `path.resolve` again.
