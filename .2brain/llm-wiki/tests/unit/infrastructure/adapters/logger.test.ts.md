---
source: tests/unit/infrastructure/adapters/logger.test.ts
sha256: ee55cd2f70a4ff5f45d9a22d95dc402e805b23eef8746d0a2a779b50ef5483d3
generated_at: 2026-09-23T20:18:12.683789+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/logger.test.ts

## Purpose

Unit tests for the shared logger adapter (`src/infrastructure/adapters/logger.ts`). This is the security-critical test suite that verifies sensitive-field redaction, error serialization, winston format wiring, and log-level/console-format resolution. A failure here means credentials leak into a log aggregator; the tests are written to close the specific gaps found by mutation testing (73 survivors at 25.74% kill rate).

## Key elements

- **`describe('redactSensitiveFields')`** — Example-based tests: primitives pass through, `password`/`token`/`authorization`/`cookie` are replaced with `[REDACTED]`, case-insensitive matching, nested objects, and arrays.
- **`describe('serializeError')`** — Verifies `name`/`message` extraction from `Error` instances, `raw` wrapping for non-Error values, and custom error class names.
- **`describe('serializeError — the production stack guard')`** — Confirms the `stack` property is present when `NODE_ENV !== 'production'` and **absent** in production; name/message are always preserved.
- **Property-based invariants (fast-check)** — Six `fc.assert` blocks covering: (1) input is never mutated, (2) idempotency, (3) no sensitive string value survives at any nesting depth, (4) arrays stay arrays, (5) array length and non-sensitive primitives are preserved, (6) the function never throws for any input.
- **`describe('the sensitive-field policy, entry by entry')`** — Table-driven tests over the real `SENSITIVE_FIELDS` set (auto-covers added fields); a size-floor guard (`≥ 20`) catches silent removals; exact-match (not substring) is verified so `passwordPolicy` is **not** redacted.
- **`stringValuesOf`** (local helper) — Recursively collects all string _values_ (ignoring keys) for leak assertions.
- **`metadata()`** (local helper) — fast-check arbitrary generating dictionaries with a mix of sensitive and random keys.
- **`RUN`** — Fixed seed (`20_260_809`), 200 runs, `endOnFailure` for reproducible property tests.
- **Truncated section** — The file continues with tests for `redactFormat`, `resolveLogLevel`, `resolveConsoleFormat`, and `resolvePersonalFieldMode` (personal-field hashing mode since G6).

## Relationships

- **Imports from `@infrastructure/adapters/logger`** (`src/infrastructure/adapters/logger.ts`): `redactSensitiveFields`, `serializeError`, `SENSITIVE_FIELDS`, `PERSONAL_FIELDS`, `redactFormat`, `resolveLogLevel`, `resolveConsoleFormat`, `resolvePersonalFieldMode`. Every test in this file exercises one of these exports directly.
- **Imports `fast-check` (`fc`)** for property-based testing.

## Notes

- **Fixed seed** (`20_260_809`): property tests are deterministic; if a counterexample is found, the seed is sufficient to reproduce it.
- **Size floor, not exact count:** the `SENSITIVE_FIELDS.size ≥ 20` assertion is deliberately a floor so adding a field never breaks CI, but removing one does.
- **Value-vs-key distinction:** leak assertions check string _values_ only. The docblock explains a naive `JSON.stringify` check would false-positive when a secret string is short (e.g. `"p"`) and also appears as a substring of a _key_ name like `"password"`.
- **Mutation-test provenance:** the file header records which specific mutants survived (production stack guard, `redactFormat` pipeline wiring, the two "INVARIANT" claims) and the tests were written to kill them.
- **NODE_ENV save/restore:** the production-stack-guard block saves `process.env.NODE_ENV` in a module-level constant and restores it in `afterEach`, including handling the `undefined` case.
- **Personal fields vs. sensitive fields:** `email` is in `PERSONAL_FIELDS` (hashed since G6), not `SENSITIVE_FIELDS` (redacted to `[REDACTED]`). Tests must not conflate the two.
