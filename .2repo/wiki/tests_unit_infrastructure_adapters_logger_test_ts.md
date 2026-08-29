# tests/unit/infrastructure/adapters/logger.test.ts

## Purpose

Unit and property-based tests for the redaction and error-serialization helpers in `src/infrastructure/adapters/logger.ts`. The file exists to prove that sensitive values (passwords, tokens, auth headers) never survive into log output and that error serialization behaves correctly across environments. The header docblock frames a miss as "a password in Datadog forever" rather than a feature bug.

## Key elements

- **`describe('redactSensitiveFields')`** — Example-based tests: primitives pass through unchanged; `password`, `token`, `authorization`, `cookie` are replaced with `[REDACTED]`; matching is case-insensitive; nesting and arrays are recursed into.
- **`describe('serializeError')`** — Verifies `name`/`message` extraction from `Error` instances, wrapping of non-Error values into `{ raw }`, and preservation of custom error class names.
- **`describe('serializeError — the production stack guard')`** — Toggles `NODE_ENV` to assert that `stack` is present in development, **absent** in production, and that `name`/`message` survive in both. Also covers the unset-`NODE_ENV` default.
- **`describe('redactSensitiveFields — invariants')`** — `fast-check` property tests (fixed seed `20_260_809`, 200 runs):
  - Input object is never mutated.
  - Redaction is idempotent.
  - No sensitive *value* appears anywhere in the output at arbitrary nesting depth (asserted via `stringValuesOf`, not `JSON.stringify`, to avoid key-name false positives).
  - Arrays remain arrays; length and non-sensitive primitives are preserved.
  - Function never throws for any input (`fc.anything()`).
- **`describe('the sensitive-field policy, entry by entry')`** — Table-driven over the real `SENSITIVE_FIELDS` set (imported, not copied). Pins the set size to ≥ 20 so silent removal fails. Confirms exact-match (not substring) lookup so `passwordPolicy` is **not** redacted.
- **`describe('redactFormat — …')`** — Drives the winston format via a `transform` helper (simulating winston's `info` → same-object contract) and checks that redaction is wired into the pipeline. *(Content truncated in source.)*
- **`stringValuesOf`** (local helper) — Recursively collects every string *value* in a nested structure, ignoring keys.
- **`metadata`** (fast-check arbitrary) — Generates dictionaries with a mix of sensitive and random keys over `fc.jsonValue()` values.
- **`RUN`** (const) — Shared `fast-check` options: `{ seed, numRuns: 200, endOnFailure: true }`.
- **`transform`** (local helper) — Calls `redactFormat().transform(info)` to exercise the winston format in isolation.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** (imported via `@infrastructure/adapters/logger`): Provides every function under test — `redactSensitiveFields`, `serializeError`, `SENSITIVE_FIELDS`, `redactFormat`, `resolveLogLevel`, `resolveConsoleFormat`. The test file is the sole consumer of these exports in the unit-test layer.
- **`fast-check`**: Supplies the property-based testing primitives (`fc.property`, `fc.assert`, `fc.dictionary`, `fc.jsonValue`, `fc.anything`, etc.) used in the invariants and array-preservation suites.

## Notes

- The `SENSITIVE_FIELDS` size guard uses `toBeGreaterThanOrEqual(20)` deliberately as a *floor*: adding a field must not break the test, but removing one will. The `it.each` cases over the set mean new fields are covered automatically, but removal is silent without this guard.
- The "no sensitive value in output" property asserts over `stringValuesOf` output, **not** over `JSON.stringify` of the whole object. The comment notes that a naive `JSON.stringify` check false-positives when a secret value happens to be a single character that also appears inside the *key* name (e.g. key `"password"` contains the letter `"p"`).
- The production stack-trace guard tests save and restore `process.env.NODE_ENV` in `afterEach` to avoid cross-test contamination.
- The header docblock references a mutation-testing score (25.74 %, 73 survivors) and identifies three previously untested regions (production stack guard, winston format wiring, the two invariants) that motivated the property-based additions in this file.
- The file describes itself as "agnostic boilerplate" inherited unchanged by every project built from this repo; changes here have cross-project security impact.
