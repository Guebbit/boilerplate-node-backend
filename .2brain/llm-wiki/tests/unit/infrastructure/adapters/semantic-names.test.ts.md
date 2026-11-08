---
source: tests/unit/infrastructure/adapters/semantic-names.test.ts
sha256: a7b083c5bbecaac4db73aa6621258ea01daee35a22dc6925a6b50a794ca6f481
generated_at: 2026-11-08T10:10:37.702148+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/semantic-names.test.ts

## Purpose

Unit tests for the `toSemanticNames` mapper (internal field name → OpenTelemetry semantic-convention name) and an integration check that the Winston console transport applies the rename after redaction has already run on the original code names.

## Key elements

- **`describe('toSemanticNames')`** — six cases covering:
  - Every key in `SEMANTIC_LOG_NAMES` is renamed and the key-count is preserved.
  - Unmapped fields pass through unchanged.
  - `actorRole` becomes `user.roles` wrapped in a single-element array.
  - A structured `error` object is spread onto `exception.type`, `exception.message`, `exception.stacktrace`, `exception.cause`, and non-standard fields (e.g. `code`) are collected under `exception.details`.
  - A bare string `error` becomes just `exception.message`.
  - `metadata` is **not** deep-cloned — the test asserts reference identity with `toBe`.
- **`describe('the transport format applies the rename')`** — one case that calls `resolveConsoleFormat().transform(…)` with a production environment (`NODE_LOG_PERSONAL_FIELDS: 'redact'`) and asserts the final JSON line carries semantic names, that `ip` was redacted *before* being renamed to `client.address`, and that the original code-name keys are absent.
- **`MESSAGE` / `LEVEL` symbols** — local aliases for `Symbol.for('message')` and `Symbol.for('level')` used to read Winston's internal slot on the rendered output object.

## Relationships

- **`src/infrastructure/adapters/semantic-names.ts`** — the module under test; supplies `SEMANTIC_LOG_NAMES` (the mapping table) and `toSemanticNames` (the rename function).
- **`src/infrastructure/adapters/logger.ts`** — supplies `resolveConsoleFormat`, the factory that returns the Winston transform used in the transport-level test.
- **`tests/support/environment.ts`** — supplies `setEnvironment`, used to switch `NODE_ENV` and `NODE_LOG_PERSONAL_FIELDS` for the redaction test.

## Notes

- **Redaction ordering is load-bearing.** The transport test explicitly verifies that redaction matches on the *code* name (`ip`) before the rename produces `client.address`. Reversing the order would silently skip redaction.
- **`metadata` must remain a reference.** The `toBe` assertion guards against an accidental `structuredClone` or spread in the rename path; downstream consumers rely on object identity.
- **`exception.details`** is the escape hatch for error fields that have no dedicated `exception.*` attribute (e.g. `code: 11_000`); it is always an object, never a scalar.
