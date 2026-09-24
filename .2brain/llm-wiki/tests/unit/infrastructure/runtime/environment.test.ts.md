---
source: tests/unit/infrastructure/runtime/environment.test.ts
sha256: c406922c2b1a71a11af394cb1033888bd775c62c1ea08b3fa81e026932774408
generated_at: 2026-09-23T20:26:10.478628+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/environment.test.ts

## Purpose

Exhaustive unit test suite for the three environment-variable coercion helpers in `src/infrastructure/runtime/environment.ts` (`environmentNumber`, `environmentDecimal`, `environmentFlag`). It focuses on the silent failure modes—inputs that a naive `Number()`, `parseInt()`, or string comparison would misread—rather than the happy path, because the helpers exist to prevent those misreads from propagating as `NaN`, truncated integers, or inverted booleans.

## Key elements

- **`CANARY`** (`'NODE_TEST_CANARY'`) — the single env-var key every test case writes to and reads from.
- **`withValue<T>(value, read)`** — local helper that sets (or deletes) `process.env[CANARY]`, invokes `read()`, and restores the prior value in a `finally` block, guaranteeing no cross-test leakage.
- **`describe('environmentNumber')`** — verifies base-10 parsing, whitespace trimming, fallback on unset/blank/prose, rejection of partial matches (`'30m'`, `'5mb'`, `'1.5'`, `'9 0 0'`), acceptance of zero/negatives, and enforcement of a caller-declared minimum.
- **`describe('environmentDecimal')`** — same shape, plus explicit rejection of forms a bare `Number()` would accept (`'.5'`, `'1e-1'`, `'+.1'`, `'Infinity'`, `'0x10'`).
- **`describe('environmentFlag')`** — confirms both vocabulary sets (`1`/`true`/`yes`/`on` and `0`/`false`/`no`/`off`) resolve correctly, that unrecognised or unset values return the caller's default (not a hardcoded off), and that whitespace is trimmed.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — the sole import target; this file is its direct test companion. No other modules are referenced.

## Notes

- Tests are deliberately exhaustive on *unusable* inputs. The inline comments document the specific production bugs each case guards against (e.g., `parseInt` reading `'5mb'` as 5; `!== '0'` kill-switch vs. `=== 'true'` opt-in inconsistency; `NaN` minutes becoming an `Invalid Date`).
- The `withValue` helper is a test-local concern; it does not export or mutate any shared state beyond `process.env[CANARY]`.
- `environmentDecimal` intentionally accepts `0` and negative values, deferring range validation to the caller—do not add a minimum-clamp test here without a corresponding change in the implementation.
