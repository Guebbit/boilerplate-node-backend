---
source: tests/unit/kernel/bearer.test.ts
sha256: 8ac7fbd71cefa863b3462ed025910a997c32487b52c64de2d419304ab10285eb
generated_at: 2026-11-08T10:26:44.823828+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/bearer.test.ts

## Purpose

Unit tests for the `bearerOf` helper, verifying that it correctly extracts a token from an `Authorization: Bearer …` header string and returns `undefined` for malformed or unrelated inputs. This ensures both the auth guard and the logout flow rely on a single, well-defined parsing contract.

## Key elements

- **`describe('bearerOf')`** — the sole test suite in the file; no additional helpers or fixtures.
- **Positive cases (`it.each`)** — confirms extraction for `Bearer abc.def`, `bearer abc`, and `BEARER   abc` (case-insensitive scheme, extra whitespace).
- **Negative cases (`it.each`)** — asserts `undefined` is returned for `undefined`, `''`, `Basic abc`, `Bearer`, `Bearer a b` (token containing a space), and `Bearerabc` (missing delimiter space).

## Relationships

- **`src/kernel/cookies.ts`** — source of the `bearerOf` function under test (imported as `@kernel/cookies`). This is the only external dependency; the test file has no other imports.

## Notes

- The token `a b` (containing a space) is treated as *invalid*, implying `bearerOf` expects a single whitespace-delimited token after the scheme.
- `Bearerabc` (no space between scheme and token) is rejected, so the parser is not purely "take everything after 'Bearer'".
- The test file uses the `@kernel/` import alias rather than a relative path, matching the project's path-alias convention.
