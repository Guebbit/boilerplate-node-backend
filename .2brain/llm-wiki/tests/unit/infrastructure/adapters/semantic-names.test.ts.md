---
source: tests/unit/infrastructure/adapters/semantic-names.test.ts
sha256: a7b083c5bbecaac4db73aa6621258ea01daee35a22dc6925a6b50a794ca6f481
generated_at: 2026-10-15T13:09:39.514010+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/semantic-names.test.ts

## Purpose

Unit tests for `toSemanticNames` and its integration into the Winston console transport. Verifies that log fields written with application-specific names are correctly renamed to OpenTelemetry semantic-convention keys, that unmapped fields pass through unchanged, and that the full transport pipeline (redaction → rename → serialise) produces the expected shape.

## Key elements

- **`describe('toSemanticNames')`** — direct unit tests of the rename function:
  - Full mapping round-trip: every key in `SEMANTIC_LOG_NAMES` is renamed, value preserved, no extra keys.
  - Unmapped fields are left as-is.
  - `actorRole` → `user.roles` (wrapped in a single-element array per the OTel convention).
  - Object `error` → spread across `exception.type`, `exception.message`, `exception.stacktrace`, `exception.cause`, `exception.details`.
  - Bare-string `error` → `exception.message` only.
  - `metadata` object is **not** deep-renamed; identity is preserved (shallow rename only).

- **`describe('the transport format applies the rename')`** — integration test that drives `resolveConsoleFormat().transform(…)` with a realistic audit record, then parses the JSON line stored under Winston's `Symbol.for('message')` key. Confirms that redaction (e.g. `ip` → `[REDACTED]`) runs on the **original** field names *before* the rename to `client.address`.

## Relationships

- **`src/infrastructure/adapters/semantic-names.ts`** — module under test; supplies `toSemanticNames` and the `SEMANTIC_LOG_NAMES` mapping table.
- **`src/infrastructure/adapters/logger.ts`** — supplies `resolveConsoleFormat`, the Winston format chain used in the transport-level test.
- **`tests/support/environment.ts`** — supplies `setEnvironment`, used to set `NODE_ENV` and `NODE_LOG_PERSONAL_FIELDS` before the redaction test.

## Notes

- The transport test accesses Winston's internal output via `Symbol.for('message')` and `Symbol.for('level')`; if Winston changes its symbol names the test breaks silently (it won't crash, it will just read `undefined`).
- Redaction ordering is a deliberate invariant being asserted: personal fields are matched and replaced **before** the semantic rename, so the redaction rules are written against the application names, not the OTel names.
- `metadata` is intentionally a shallow, identity-preserving pass-through — any test that expects renamed keys inside `metadata` would be testing the wrong contract.
