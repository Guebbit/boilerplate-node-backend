---
source: src/modules/account/tests/unit/session-id.test.ts
sha256: febf66d6eaab269dba1fddbebd01fbf0a3c2e17bc6990478dc81c9622ca04f68
generated_at: 2026-11-08T04:49:37.240500+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-id.test.ts

## Purpose

Unit tests for the cookie-mode session ID primitives (`newSessionId`, `looksLikeSessionId`). Because the kernel dispatches on the token's shape and 256 bits of entropy underpin its security, the tests assert both structural invariants (prefix, length, alphabet) and behavioral ones (uniqueness, non-collision with JWTs/machine keys, at-rest hashing) rather than relying on implementation details.

## Key elements

- **`describe('newSessionId')`** — four assertions against `newSessionId()`:
  - Shape: starts with `SESSION_TOKEN_PREFIX`; remainder matches `^[\w-]{43}$` (32 random bytes, base64url).
  - Uniqueness: 500 consecutive calls yield 500 distinct values (practical, not cryptographic, check).
  - Non-collision: output never starts with `eyJ` (JWT) or `sk_` (machine key), preserving the kernel's prefix-based dispatch.
  - At-rest safety: `hashToken(id)` ≠ `id` and matches `^[\da-f]{64}$` (SHA-256 hex), confirming a database read cannot be replayed.
- **`describe('looksLikeSessionId')`** — table-driven (`it.each`) checks that the discriminator returns `true` only for the valid `ses_` prefix, and `false` for JWTs, API keys, empty strings, and a prefix embedded mid-string (`x_ses_abc`).

## Relationships

- **`src/modules/account/session/session-id.ts`** — the system under test; provides `newSessionId` and `looksLikeSessionId`.
- **`src/kernel/authentication.ts`** — supplies `SESSION_TOKEN_PREFIX`, the constant the tests use to validate the leading segment.
- **`src/infrastructure/security/hash-token.ts`** — supplies `hashToken`, used to verify the at-rest digest property and its hex-64 output shape.

## Notes

- The 43-character base64url assertion encodes a 32-byte (256-bit) entropy contract; a regression in `crypto.getRandomValues` length would be caught here.
- The uniqueness test (500 calls) is a practical smoke check, not a birthday-bound proof — it catches accidental deterministic output.
- The collision guards are prefix-based (`eyJ`, `sk_`), matching the kernel's dispatch strategy; they do not prove cryptographic separation.
- `looksLikeSessionId` is expected to be a *shape check only* (prefix + length), not a validity/revocation check — the table cases confirm it rejects structurally similar tokens without parsing them.
