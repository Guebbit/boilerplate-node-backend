---
source: src/modules/account/tests/unit/session-id.test.ts
source_sha256: febf66d6eaab269dba1fddbebd01fbf0a3c2e17bc6990478dc81c9622ca04f68
context_sha256: c3a81b0e773073beff1bac51e2aede31c846fd37b08c07f252e0e9f997be5811
generated_at: 2026-11-22T04:08:18.322486+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/session-id.test.ts

## Purpose
Unit tests for the opaque session id used by `cookie` mode authentication. They verify the id's shape (which the kernel dispatches on) and its entropy, asserting both explicitly instead of assuming them.

## Key elements
- `describe('newSessionId')`:
  - Id is `SESSION_TOKEN_PREFIX` followed by 43 base64url characters (32 random bytes), so no signing secret is needed.
  - 500 generated ids are all distinct.
  - Id never starts with `eyJ` (JWT) or `sk_` (machine key), so the guard can dispatch on it.
  - `hashToken(id)` differs from the id and is a 64-char lowercase hex digest, so a database read cannot be replayed as a session.
- `describe('looksLikeSessionId')`: a table-driven (`it.each`) check that `ses_abc` is accepted, while a JWT, an API key, an empty string, and a value with the prefix in the wrong place (`x_ses_abc`) are rejected.

## Relationships
- `src/modules/account/session/session-id.ts`: the unit under test (`newSessionId`, `looksLikeSessionId`).
- `src/kernel/authentication.ts`: supplies `SESSION_TOKEN_PREFIX`, which the tests use to check the id's prefix.
- `src/infrastructure/security/hash-token.ts`: supplies `hashToken`, used to check that the stored form is a digest rather than the raw id.

## Notes
- The uniqueness test is a probabilistic sanity check over 500 samples, not a proof of entropy.
- The `looksLikeSessionId` cases use the literal `ses_` prefix, which implies `SESSION_TOKEN_PREFIX` is `ses_`. That test does not import the constant.
