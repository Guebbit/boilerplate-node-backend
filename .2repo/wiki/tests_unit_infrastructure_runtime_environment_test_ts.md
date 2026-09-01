# tests/unit/infrastructure/runtime/environment.test.ts

## Purpose

Exhaustive unit tests for the two shared environment-variable coercions (`environmentNumber` and `environmentFlag`). The suite focuses on failure modes — unset, blank, partial, and unrecognised inputs — because those are the silent regressions (NaN leaking into `Date`/`maxAge`, `parseInt` reading a prefix, inconsistent flag vocabulary) the helpers exist to prevent.

## Key elements

- **`CANARY`** – A dedicated env-var name (`NODE_TEST_CANARY`) so every test case mutates the same variable without colliding with other tests.
- **`withValue(value, read)`** – Local helper (not exported). Saves the prior value of `CANARY`, sets or deletes it, runs `read()`, then restores the original state in a `finally` block.
- **`describe('environmentNumber')`** – Covers: base-10 parsing (rejects octal read of `0900`), surrounding-whitespace tolerance, fallback-to-default for unset / blank / whitespace / prose, refusal of partially-numeric strings (`30m`, `5mb`, `1.5`, `9 0 0`), acceptance of zero and negatives when no minimum is set, and fallback when the parsed value is below the declared minimum.
- **`describe('environmentFlag')`** – Covers: both on-vocabulary (`1`, `true`, `TRUE`, `yes`, `on`) and off-vocabulary (`0`, `false`, `FALSE`, `no`, `off`) with whitespace, dual-vocabulary acceptance for a single flag, and default fallback for unset / blank / unrecognised values.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** – The sole import. The test file calls `environmentNumber` and `environmentFlag` (exported from that module) and asserts their return values against the expected defaults or parsed results. No other project files are referenced.

## Notes

- All tests mutate a **single** env var (`CANARY`) via `withValue`, which saves and restores state. This avoids cross-test pollution but means the suite cannot run truly in parallel on the same process — a standard Jest/Node constraint, not a bug.
- The test names and inline comments document *historical* bugs (e.g. `!== '0'` kill-switches, `parseInt` prefix reads). When refactoring the helpers, treat those comments as regression rationale, not style notes.
- `environmentNumber`'s third argument is a **minimum**: values parsed below it fall back to the default rather than returning a clamped number. The tests pin this at minimum = 1.
- No mocking or spies are used; the helpers are pure functions of `process.env` + arguments, so the `withValue` wrapper is the entire harness.
