---
source: tests/unit/infrastructure/adapters/logger.test.ts
sha256: ff6027e44a1fd5b2f69d2da9168d4bbe50f596843fb45f56690491d592dd82fa
generated_at: 2026-09-27T16:04:09.074606+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/logger.test.ts

## Purpose

Unit and property-based tests for the log redaction and error-serialization utilities in `src/infrastructure/adapters/logger.ts`. The file exists to guarantee that credentials never leak into aggregated logs, that circular and shared structures don't crash the logger, and that two explicitly stated invariants (no input mutation, object-identity preservation) hold for arbitrary caller-supplied metadata.

## Key elements

- **`describe('redactSensitiveFields')`** — Deterministic cases covering: primitives pass-through, redaction of `password`/`token`/`authorization`/`cookie` (case-insensitive, camelCase, kebab-case, API-specific spellings), nested objects, arrays, circular-reference marking (`[Circular]`), shared-reference preservation, and inline `Error` serialisation.
- **`describe('serializeError')`** — Extracts `name`/`message`/`cause` from `Error` instances; wraps non-Error values under `raw`; preserves custom error names.
- **`describe('serializeError — the production stack guard')`** — Asserts that `stack` is present when `NODE_ENV` is unset or non-production, and **absent** when `NODE_ENV === 'production'`; `name`/`message` always survive.
- **`describe('redactSensitiveFields — invariants')`** — `fast-check` property tests (seed `20260809`, 200 runs): input is never mutated; redaction is idempotent; no sensitive *value* appears anywhere in the output at any depth; arrays stay arrays; function never throws on `fc.anything()`.
- **`stringValuesOf`** (local helper) — Recursively collects all string *values* from a structure (keys ignored), used by the property assertions.
- **`metadata`** (local helper) — `fc.dictionary` arbitrary that mixes known sensitive keys with random keys and `fc.jsonValue()` values.
- **`RUN`** (local constant) — Shared `fast-check` config object (`{ seed, numRuns: 200, endOnFailure: true }`).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Sole production dependency. Every test imports and exercises the functions and constants exported there (`redactSensitiveFields`, `serializeError`, `redactFormat`, `resolveLogLevel`, `resolveConsoleFormat`, `resolvePersonalFieldMode`, `SENSITIVE_FIELDS`, `PERSONAL_FIELDS`). The test file's comments reference the source's docblock invariants and mutation-testing history, indicating it was written (or expanded) specifically to close gaps identified by a mutation run.

## Notes

- The production-stack-guard block **mutates `process.env.NODE_ENV`** in each test and restores it in `afterEach`. Any test running in parallel on the same worker that also reads `NODE_ENV` will see a torn value.
- The "no sensitive value in output" property asserts over **values only**, not over `JSON.stringify` of the whole tree. A naive `JSON.stringify` assertion fails on the legitimate counter-example where the secret string `"p"` appears inside the key `"password"`.
- Circular vs. shared references are deliberately distinguished: a self-referencing object yields `'[Circular]'`, while the *same* object reached via two different parent keys is kept intact (identity preserved).
- The file header comment records a 25.74% mutation score with 73 survivors clustered in the production stack guard, the winston `redactFormat` wiring, and the two untested invariants — context for why those blocks exist.
- `redactFormat`, `resolveLogLevel`, `resolveConsoleFormat`, and `resolvePersonalFieldMode` are imported but the visible portion of the file (truncated) does not show test cases for them; they may be exercised further down.
