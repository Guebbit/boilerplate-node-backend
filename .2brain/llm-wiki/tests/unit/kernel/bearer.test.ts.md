---
source: tests/unit/kernel/bearer.test.ts
sha256: 8ac7fbd71cefa863b3462ed025910a997c32487b52c64de2d419304ab10285eb
generated_at: 2026-10-15T13:21:57.198043+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/bearer.test.ts

## Purpose

Unit tests for the `bearerOf` helper — the single `Authorization: Bearer` header parser shared by the auth guard and the logout flow. The file pins down the accepted and rejected input shapes so the parser's contract stays stable.

## Key elements

- **`bearerOf` (imported from `@kernel/cookies`)** — the function under test. Not defined here; only exercised.
- **Valid-header suite (`it.each`, 3 cases)** — asserts the token is extracted for standard, lowercase, and multi-space `BEARER` prefixes.
- **Invalid/edge-case suite (`it.each`, 6 cases)** — asserts `undefined` is returned for: missing header, empty string, `Basic` scheme, bare `Bearer` (no token), token containing a space (`Bearer a b`), and missing space after the scheme (`Bearerabc`).

## Relationships

- **`src/kernel/cookies.ts`** — provides `bearerOf`. This test file is the sole dedicated unit test for that export; the guard and logout modules are consumers of the same function but are not exercised here.

## Notes

- The import uses the `@kernel/cookies` path alias rather than a relative path, matching the project's alias convention for the `src/kernel/` directory.
- "Token containing a space" (`Bearer a b`) is explicitly treated as invalid — the parser does not accept whitespace-delimited compound tokens.
- Case-insensitivity of the scheme keyword is a tested guarantee, not an implementation detail to assume.
