# tests/unit/infrastructure/runtime/environment.test.ts

## Purpose

Exhaustive unit tests for the three environment-readers in `src/infrastructure/runtime/environment.ts`. The file exists to close a coverage gap left when the source moved from `src/infrastructure/` into `runtime/` and the coverage glob no longer matched it. Because the source is a fail-fast boot check, the tests emphasise every failure mode (missing, blank, whitespace-only, partially-numeric, unrecognised) rather than the happy path.

## Key elements

- **`KEYS`** – the four required env vars (`NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_DB_URI`, `NODE_MONGODB_PORT`) saved/restored around each `validateRequiredEnvironment` test.
- **Top-level `it` blocks** – verify `validateRequiredEnvironment` accepts valid configs, reports *all* missing keys in one error, treats whitespace-only values as missing, and refuses boot when neither `NODE_DB_URI` nor `NODE_MONGODB_PORT` is usable.
- **`withValue` helper** – sets a canary env var (`NODE_TEST_CANARY`) to a given value (or deletes it), runs a callback, then restores the original. Used by both coercion test suites.
- **`describe('environmentNumber')`** – covers integer parsing, base-10 (not octal) handling, whitespace trimming, fallback for unset/blank/prose, rejection of partial-numeric strings (`30m`, `1.5`, `9 0 0`), and the `min` parameter.
- **`describe('environmentFlag')`** – covers both on/off vocabularies (`1`/`true`/`yes`/`on` vs `0`/`false`/`no`/`off`), case-insensitivity, and default fallback for unset/blank/unrecognised values.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** (sibling, source under test) — imports `environmentFlag`, `environmentNumber`, and `validateRequiredEnvironment`. Every assertion in this file exercises one of those three exports; no other modules are touched.

## Notes

- The tests deliberately target *failure* inputs (NaN-producing strings, octal-looking values, `5mb`-style partials) because those were the historical bugs; the happy path is exercised only to confirm it still works.
- `withValue` uses a single fixed canary key (`NODE_TEST_CANARY`), not one of the four required keys, so coercion tests don't interfere with the `validateRequiredEnvironment` setup.
- `beforeEach` sets `NODE_MONGODB_PORT` to *deleted* (not just empty) to ensure the "URI or port" test exercises the true-absent branch.
- The file was added specifically to plug a coverage-glob drift after a directory rename; if the source moves again, this file needs its import path updated or the same gap reappears.
