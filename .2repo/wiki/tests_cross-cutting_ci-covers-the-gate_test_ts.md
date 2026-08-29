# tests/cross-cutting/ci-covers-the-gate.test.ts

## Purpose

Guard test that asserts every check in the `npm run complete` chain (the local pre-commit gate) has a corresponding job in `.github/workflows/`. It exists because the "what must pass" rule is defined in two places and had drifted: five checks reached the local gate but had no CI job, so `--no-verify`, missing husky, or fork PRs could bypass them while CI stayed green.

## Key elements

- **`packageScripts()`** — Reads `package.json` and returns the `scripts` record.
- **`expand(script, all, seen?)`** — Recursively resolves an `npm run` chain into its leaf script names. Stops at real commands (e.g. `jest …`) and uses a `seen` set to guard against circular references.
- **`scriptsRunByCi(all)`** — Scans every `.yml` in `.github/workflows/` for `npm run <name>` invocations (skipping comment lines), then expands each name. Returns a `Set` of all script names CI touches.
- **`COVERED_UNDER_ANOTHER_NAME`** — Small exception map (`test:cross-cutting` → `test:unit:coverage`) for gate members CI covers under a different spelling. Each entry requires a comment justifying the mapping.
- **`describe('CI runs every check the local gate does')`** — Two tests:
  - *leaves no member of `complete` without a job* — the actual assertion.
  - *actually reads both sides* — canary: asserts both expansions are non-trivially sized so a vacuous pass (e.g. file moved, script renamed) fails loudly.

## Relationships

No graph neighbors.

## Notes

- **One-directional by design.** CI may run *more* than the gate (e.g. `fuzz.yml`, `mutation.yml` are nightly-only). The test only fails when the gate has a member CI lacks.
- **Comment filtering is load-bearing.** `ci.yml` contains a comment mentioning `npm run complete`; without the `!line.trim().startsWith('#')` filter the test would pass while the gap it guards remains open.
- **Exception list is intentionally tiny.** Adding an entry to `COVERED_UNDER_ANOTHER_NAME` must be argued in a PR diff; the repo otherwise avoids exception lists.
- **Expansion is name-based, not semantic.** The test compares script names after full expansion. It does not compare arguments to underlying tools (e.g. two `jest` invocations with different path args are not treated as "the same check" unless mapped via the exception table).
