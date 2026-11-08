---
source: tests/unit/infrastructure/security/password-hash.test.ts
sha256: 8257d3e655c6730eddd3454f9cb28a53564dabd63b0bd7ce1e4dffb36b7303f0
generated_at: 2026-11-08T10:24:41.032035+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/password-hash.test.ts

## Purpose

Unit tests for the argon2id password-hashing module. Verifies the PHC-string output format, per-hash salting, correct verification semantics, and the specific behaviours that distinguish this implementation from the bcrypt it replaced (no 72-byte truncation, byte-counting for multi-byte passwords, cost read from the stored string, graceful rejection of foreign formats).

## Key elements

- **`describe('hashPassword')`** — three tests:
  - Asserts the stored string matches the expected `argon2id` PHC regex with the module's cost parameters (`m=19456,t=2,p=1`) and base64-encoded salt/tag of the correct lengths.
  - Asserts two hashes of the same password differ (unique salt).
  - Asserts `hashPasswordSync` produces the same PHC shape (the "import-time decoy" use case).

- **`describe('verifyPassword')`** — six tests:
  - Round-trip: correct password → `true`, wrong password → `false`.
  - A sync-produced hash still verifies.
  - **No 72-byte limit**: two 74-byte passwords sharing a 72-byte prefix must not cross-verify (regression guard against bcrypt behaviour).
  - **Multi-byte counting**: a password with `ä`, `ö`, and CJK characters must verify by byte-length, not character-count.
  - **Cost read from stored hash**: a hand-built `node:crypto` argon2id hash at `m=8192,t=1` (cheaper than the module's constants) still verifies, confirming `verifyPassword` parses parameters from the PHC string rather than hard-coding them.
  - **Rejection table** (`it.each`): bcrypt hash, empty string, argon2i hash, and plaintext are all refused (return `false`) without throwing.

## Relationships

- **Imports** `hashPassword`, `hashPasswordSync`, `verifyPassword` from `src/infrastructure/security/password-hash.ts` — the sole production dependency under test.
- **Dynamically imports** `node:crypto` (`argon2Sync`, `randomBytes`) inside one test to construct a legacy-cost hash without adding a test fixture.

## Notes

- The "decoy" sync hash is a real use case: `hashPasswordSync` exists to produce a value at import time (before any `await` is possible). Tests confirm it yields the same PHC shape and is verifiable.
- The rejection tests assert `false`, not a throw. The production contract is that `verifyPassword` never rejects on malformed input — it simply returns `false`.
- The cost-reading test builds its PHC string by hand with `base64` + `replaceAll('=', '')` to match the module's encoding convention (standard base64 without padding). If the module ever switches encoding, this test will break independently.
- All test names and the file's block comment are deliberately verbose to encode *why* each case exists (e.g., the bcrypt 72-byte note), not just *what* it checks.
