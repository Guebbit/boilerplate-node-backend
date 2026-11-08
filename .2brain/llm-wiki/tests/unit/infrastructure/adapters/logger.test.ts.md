---
source: tests/unit/infrastructure/adapters/logger.test.ts
sha256: 1336fc359066a3709686de85644cccab9bd011633100e3fe3b0122e911681e4c
generated_at: 2026-11-08T10:07:57.283624+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/logger.test.ts

## Purpose

Unit and property-based tests for the logger adapter's redaction and error-serialization logic. The file exists to guarantee that credentials never reach a log aggregator, that error objects are serialised safely, and that two docblock-invariant claims (no input mutation, identity-preserving format) are actually enforced by the test suite rather than asserted only in prose.

## Key elements

- **`describe('redactSensitiveFields', …)`** — verifies redaction of sensitive keys (password, token, authorization, cookie), case-insensitivity, nested objects, arrays, circular references (`[Circular]` marker), shared (non-circular) objects, nested `Error` instances, and API-specific field spellings (`passwordConfirm`, `newSecret`, `antibot-challenge-token`).
- **`describe('serializeError', …)`** — checks extraction of `name`/`message`, preservation of `cause`, wrapping of non-`Error` values under `raw`, and custom error class names.
- **`describe('serializeError — the production stack guard', …)`** — uses `setEnvironment` to pin `NODE_ENV` and asserts that `stack` is present only in `development`/`test`, omitted in `production`, `staging`, `undefined`, and `''`.
- **`describe('redactSensitiveFields — invariants', …)`** — property-based tests (via `fast-check`, fixed seed `20_260_809`, 200 runs) covering: no mutation of input, idempotency, absence of sensitive *values* at arbitrary nesting depth, array type/length preservation, and "never throws for any input."
- **`stringValuesOf`** — local helper that recursively collects all string *values* (ignoring keys) for use in the "no sensitive value leaks" property.
- **`metadata()`** — `fast-check` arbitrary generating dictionaries with a mix of sensitive and random keys.
- **`RUN`** — shared property-test config (`seed`, `numRuns`, `endOnFailure`).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — the module under test. All functions (`redactSensitiveFields`, `serializeError`, `redactFormat`, `resolveLogLevel`, `resolveConsoleFormat`, `resolvePersonalFieldMode`), constants (`SENSITIVE_FIELDS`, `SENSITIVE_KEY_FRAGMENTS`, `PERSONAL_FIELDS`), and types are imported from here.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to temporarily override `process.env.NODE_ENV` so the production-stack-guard tests can assert both the "stack included" and "stack omitted" branches deterministically.

## Notes

- The file header documents a mutation-testing result (25.74 %, 73 survivors) and identifies the three clusters those survivors occupied; the invariant and stack-guard tests were added specifically to kill them.
- The "no sensitive value" property asserts over `stringValuesOf` output rather than `JSON.stringify` of the whole object. A naive `JSON.stringify` check fails when a generated *key* (e.g. `"password"`) contains the secret as a substring.
- `cookieData` is imported from `@infrastructure/http/cookies.generated`; its usage is in the truncated portion of the file.
- Property tests use a **fixed seed** for reproducibility across CI runs; changing the seed will change generated counterexamples.
- The circular-reference test (`input.self = input`) and the shared-object test (`{ a: shared, b: shared }`) are intentionally distinct: the former must emit `[Circular]`, the latter must preserve both references without recursion.
