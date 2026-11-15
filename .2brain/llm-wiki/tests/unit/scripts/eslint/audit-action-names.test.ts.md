---
source: tests/unit/scripts/eslint/audit-action-names.test.ts
sha256: 9a05222c8c4a0c21c7d9d99d6a8bdfb2f05ad662a126d53aee30e2e9bf80e65d
generated_at: 2026-11-15T00:26:15.783640+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/audit-action-names.test.ts

## Purpose

Live-verifies that the `no-restricted-syntax` block in `eslint.config.ts` governing audit action names actually fires (and coexists with the double-cast / try-catch bans in the same block). Because `no-restricted-syntax` *replaces* rather than merges between config blocks, a unit-level assertion on the config object would miss a regression where one ban silently drops. Spawning the real `eslint` binary against a throwaway probe file is the only way to confirm all three rules survive in the flat-config resolution order.

## Key elements

- **`lintAuditFile(source)`** — writes `source` to `src/modules/__audit-names-probe/audit.ts`, runs the real ESLint binary (`node_modules/.bin/eslint --format json`) with `REPO_ROOT` as cwd, and returns only the `no-restricted-syntax` message strings. Treats a non-zero exit (a finding) as the expected success path.
- **`describe('audit.ts action names')`** — three specs:
  - Accepts dotted lower snake_case names of 2–4 segments (e.g. `order.refunded`, `user.cart_item.removed`).
  - Refuses names that violate the pattern (uppercase, no dots, hyphens, >4 segments, trailing dot).
  - Confirms the same block still flags a double cast (`as unknown as …`) and a `try/catch` — guarding against the replace-not-merge gotcha.
- **`afterEach`** — removes the `PROBE_DIR` so no residual files pollute the repo.

## Relationships

- **`tests/support/paths.ts`** — imports `REPO_ROOT`, which anchors the ESLint binary path, the probe directory, and the `cwd` passed to `execFile`.

## Notes

- The probe directory lives under `src/modules/__audit-names-probe/` because the ESLint block matches files by the pattern `src/modules/*/audit.ts`. Any other location would bypass the rule under test.
- The ESLint invocation intentionally ignores the non-zero exit code (`_error` is unused); a finding *is* the expected outcome in the "refuses" cases.
- The test does **not** assert on which specific rule selector fired—only the message count. This keeps it resilient to wording changes in the ESLint config while still catching a selector going missing.
- Cleanup uses `rmSync(…, { force: true })`; if a previous run crashed before `afterEach`, the directory is still safely removed on the next run.
