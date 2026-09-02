# tests/unit/infrastructure/adapters/logger.test.ts

## Purpose

Unit tests for the logger adapter's redaction and error-serialization logic. Its stated job is to guarantee that credentials never reach a log aggregator (e.g. Datadog). The suite covers example-based assertions, property-based invariants (via fast-check), and table-driven checks over the actual policy sets, so that a new sensitive field is tested automatically and a removed one is caught by a size guard.

## Key elements

- **`describe('redactSensitiveFields')`** — example tests: primitives pass through, sensitive fields/headers become `'[REDACTED]'`, case-insensitive matching, nested objects, and array elements.
- **`describe('serializeError')`** — extracts `name`/`message` from `Error` instances; wraps non-Error values in `{ raw }`; preserves custom error names.
- **`describe('serializeError — the production stack guard')`** — asserts `stack` is present when `NODE_ENV !== 'production'` and absent when it is `'production'`; restores the env variable in `afterEach`.
- **`describe('redactSensitiveFields — invariants')`** — property-based tests (fast-check, seed `20_260_809`, 200 runs):
  - Input is never mutated.
  - Redaction is idempotent.
  - No sensitive string *value* appears anywhere in the output at any depth.
  - Arrays stay arrays.
  - Non-sensitive primitives in arrays are preserved.
  - Function never throws for any input (`fc.anything()`).
- **`describe('the sensitive-field policy, entry by entry')`** — `it.each` over the live `SENSITIVE_FIELDS` set (no copied list); a size floor (≥ 20) catches silent removals; verifies exact-match (not substring) so `passwordPolicy` is not redacted.
- **`describe('the personal-data policy')`** — tests for `PERSONAL_FIELDS` (content truncated in source).
- **`stringValuesOf`** (local helper) — recursively collects all string *values* in a structure, ignoring keys, to avoid false matches on substrings inside key names.
- **`metadata()`** (local helper) — fast-check arbitrary producing dictionaries with a mix of sensitive and random keys.
- **`RUN`** — shared config object (`seed`, `numRuns`, `endOnFailure`) for all property tests.
- **Imports from `@infrastructure/adapters/logger`** — `redactSensitiveFields`, `serializeError`, `SENSITIVE_FIELDS`, `PERSONAL_FIELDS`, `redactFormat`, `resolveLogLevel`, `resolveConsoleFormat` (the latter three are imported but their test blocks fall in the truncated portion).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — the sole production module under test. Every `describe` block exercises functions or constants exported from that file. The test file is the only consumer of `SENSITIVE_FIELDS` and `PERSONAL_FIELDS` in the dependency graph, pinning their shape and size.

## Notes

- The top docblock records a mutation-testing score (25.74 %, 73 survivors) and identifies three previously untested areas the suite now covers: the production stack guard, the winston `redactFormat` wiring, and the two invariants (no-mutation, same-object-identity).
- The "no sensitive value in output" property asserts over *string values* specifically, not `JSON.stringify`, because a naive whole-string assertion produces false positives (e.g. the letter "p" inside the key `"password"`).
- Table-driven tests iterate the **live** `SENSITIVE_FIELDS` collection rather than a hardcoded list, so adding a field is covered for free; the `≥ 20` size check is a *floor*, so additions never break the test but removals do.
- `NODE_ENV` is mutated in place and restored in `afterEach`; tests that delete it rely on the implementation comparing `!== 'production'` (i.e. unset = non-production).
- The file is truncated; tests for `redactFormat`, `resolveLogLevel`, `resolveConsoleFormat`, and the full `PERSONAL_FIELDS` block exist beyond the visible content.
