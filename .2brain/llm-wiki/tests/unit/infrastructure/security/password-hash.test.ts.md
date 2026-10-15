---
source: tests/unit/infrastructure/security/password-hash.test.ts
sha256: 8257d3e655c6730eddd3454f9cb28a53564dabd63b0bd7ce1e4dffb36b7303f0
generated_at: 2026-10-15T13:20:02.419171+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/password-hash.test.ts

## Purpose

Unit tests for the argon2id-based password hashing module. Validates the PHC string format, salt uniqueness, round-trip correctness, the absence of bcrypt's 72-byte truncation, multi-byte handling, cost-parameter portability across versions, and graceful rejection of foreign or malformed stored values.

## Key elements

- **`describe('hashPassword')`** — three cases:
  - PHC string shape: `$argon2id$v=19$m=19456,t=2,p=1$<22-char salt>$<43-char tag>` (base64 without padding).
  - Two concurrent hashes of the same input produce different strings (unique salt).
  - `hashPasswordSync` yields the same prefix, documented as "the one import-time decoy."

- **`describe('verifyPassword')`** — six cases:
  - Correct password → `true`; wrong password → `false`.
  - A hash produced by `hashPasswordSync` still verifies.
  - Two passwords sharing their first 72 bytes do **not** cross-match (bcrypt regression guard).
  - Multi-byte characters are counted by bytes, not JS characters.
  - A hand-built hash with a cheaper cost (`m=8192,t=1,p=1`) still verifies — the cost is read from the stored string, not a module constant.
  - Parameterized rejection: a bcrypt hash, an empty string, an `argon2i` string, and a bare plaintext all return `false` **without throwing**.

## Relationships

- **`src/infrastructure/security/password-hash.ts`** — the module under test. The test imports `hashPassword`, `hashPasswordSync`, and `verifyPassword` from it. The "older cost" test also imports `argon2Sync` and `randomBytes` from `node:crypto` directly to fabricate a legacy-format PHC string without going through the module.

## Notes

- The "import-time decoy" (`hashPasswordSync`) exists so that a static analysis tool or bundler that evaluates the module at import time sees a valid argon2id hash rather than a plaintext literal. Its test only checks the prefix, not full round-trip, because it is not the primary path.
- The rejection test for non-argon2id inputs asserts `false` is **returned**, not that an exception is thrown. If `verifyPassword` starts throwing on malformed input, these tests will fail in a way that's easy to misread as a "wrong result" rather than a contract violation.
- Cost parameters (`m=19456, t=2, p=1`) are asserted in the shape test but are *not* the source of truth — the "older cost" test confirms `verifyPassword` reads them from the stored string. If the module's constants change, only the shape test's regex needs updating.
