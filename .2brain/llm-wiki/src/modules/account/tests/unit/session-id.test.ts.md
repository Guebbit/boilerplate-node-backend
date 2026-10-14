---
source: src/modules/account/tests/unit/session-id.test.ts
sha256: febf66d6eaab269dba1fddbebd01fbf0a3c2e17bc6990478dc81c9622ca04f68
generated_at: 2026-10-14T09:23:15.897245+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-id.test.ts

## Purpose
Unit tests for the `cookie`-mode session ID. The kernel dispatches on the ID's shape and 256 bits of entropy is the entire security guarantee, so this file locks in both invariants rather than assuming them.

## Key elements
- **`describe('newSessionId')`** — Four assertions on the generated ID:
  - Starts with `SESSION_TOKEN_PREFIX`; remainder matches `^[\w-]{43}$` (32 random bytes, base64url, no signing secret).
  - 500 generated IDs are all unique.
  - ID never starts with `eyJ` (JWT) or `sk_` (machine key), preserving the kernel's shape-based dispatch.
  - `hashToken(id)` ≠ `id` and is a 64-char lowercase hex string (SHA-256 digest stored instead of the raw token).
- **`describe('looksLikeSessionId')`** — Table-driven test (5 rows) verifying the shape discriminator accepts a well-formed ID and rejects a JWT, an API key, an empty string, and a prefix in the wrong position.

## Relationships
- **`@modules/account/session/session-id`** — The module under test; provides `newSessionId` and `looksLikeSessionId`.
- **`@kernel/authentication`** — Supplies `SESSION_TOKEN_PREFIX`, the constant the tests assert against.
- **`@infrastructure/security/hash-token`** — Supplies `hashToken`, used to confirm the ID is stored as its digest (not the raw value).

## Notes
- The 43-character base64url length is the fingerprint of exactly 32 bytes of entropy; changing the entropy length would break this assertion.
- The "prefix in the wrong place" row (`x_ses_abc`) is the only case that distinguishes an anchored prefix check from a mere `includes`; it guards against a regression to a looser match.
- Uniqueness is sampled (500 draws), not proven exhaustively — a probabilistic check that would only catch a broken RNG or a no-op implementation.
