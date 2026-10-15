---
source: tests/unit/infrastructure/adapters/logger.test.ts
sha256: 89f8338111724703b67ee37718e14514354743aab2442e7d178bc8e43b2f2ea0
generated_at: 2026-10-15T13:07:07.805071+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/logger.test.ts

## Purpose

Unit and property-based tests for the logger adapter's two security-critical jobs: redacting sensitive credentials from arbitrary log metadata and safely serialising errors. The file exists because a gap in either function means a live password reaches a log aggregator permanently.

## Key elements

- **`describe('redactSensitiveFields')`** — Unit tests covering: pass-through of primitives, redaction of password/token/authorization/cookie fields, case-insensitive key matching, nested object redaction, key-fragment matching (camelCase, kebab-case, API-specific spellings like `passwordConfirm`), circular-reference marking (`[Circular]`), shared-reference preservation, inline `Error` serialisation, and array traversal.
- **`describe('serializeError')`** — Unit tests for: `cause` preservation, `name`/`message` extraction, non-Error values wrapped under `raw`, custom error subclass names.
- **`describe('serializeError — the production stack guard')`** — Verifies that `stack` is **present** only when `NODE_ENV` is `development` or `test`, and **absent** for `production`, `staging`, `''`, and `undefined`. Confirms `name`/`message` survive regardless.
- **`describe('redactSensitiveFields — invariants')`** — Property-based tests (fast-check, fixed seed `20_260_809`, 200 runs) asserting: the input object is never mutated, redaction is idempotent, no sensitive *value* appears at any nesting depth, arrays remain arrays, array length and non-sensitive primitives are preserved, and the function never throws.
- **`stringValuesOf`** — Local helper that recursively collects all string *values* (ignoring keys) from a structure; used by the invariant tests to avoid false positives when a secret appears as a substring of a key name.
- **Imports** — All SUT symbols (`redactSensitiveFields`, `serializeError`, `SENSITIVE_FIELDS`, `SENSITIVE_KEY_FRAGMENTS`, `PERSONAL_FIELDS`, `redactFormat`, `resolveLogLevel`, `resolveConsoleFormat`, `resolvePersonalFieldMode`) come from `@infrastructure/adapters/logger`. `setEnvironment` comes from `@tests/environment`.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — The module under test. Every function and constant exercised in this file is imported from there.
- **`tests/support/environment.ts`** — Supplies `setEnvironment`, which mutates `process.env.NODE_ENV` before each assertion in the production-stack-guard block so the same code path can be tested under different environments.

## Notes

- The file header documents a prior mutation-testing run (25.74% killed, 73 survivors). Survivors clustered in the production stack-trace guard, the winston `redactFormat` wiring, and the two invariants (no-mutation, identity preservation) that had no test coverage — all are now explicitly tested here.
- The "no sensitive value" invariant asserts over **values only** (via `stringValuesOf`), not over `JSON.stringify` of the whole object. A naive whole-string check false-positives when a generated secret is a substring of a *key* name (e.g. secret `"p"` inside key `"password"`).
- `email` is classified as a **PERSONAL** field (hashed, not `REDACTED`) since "G6"; the nested-object test deliberately uses `username` to avoid conflating the two categories.
- Shared references (an object reachable via two paths) are preserved as the same reference; only true cycles get the `[Circular]` marker.
- Property tests use a hard-coded seed for reproducibility; `endOnFailure: true` stops at the first counterexample.
