---
source: scripts/security/corpus-digest.ts
source_sha256: 3cdda19e3c43db5331c3ef5211bfcdf0a433264c857479b1a37822dab133db03
context_sha256: 004009f8048fa09bd7b01b35e75d562679588a04735af32d39c1abc2da1243cc
generated_at: 2026-11-22T02:17:35.503272+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/security/corpus-digest.ts

## Purpose
Integrity check for a downloaded corpus. It refuses any bytes whose SHA-256 does not match a pinned digest. It lives in its own module because `refresh-breached-passwords.ts` runs on import, and a test must be able to load this code without a network or a database.

## Key elements
- `assertCorpusDigest(bytes, expected, label): void`
  - Hashes `bytes` (a `Uint8Array`, the body exactly as received) with SHA-256 via `node:crypto` and compares the lowercase hex digest to `expected`.
  - Returns nothing on a match.
  - On a mismatch it throws an `Error` of the form `<label>: SHA-256 is <actual>, expected <expected>. Refusing the corpus.`
  - `label` names what was downloaded in the error message.

## Relationships
- `scripts/security/refresh-breached-passwords.ts`: the downloader this check was split out of. The doc comment says a moved, truncated or tampered corpus must never be filtered into the committed list. The comment states this purpose, but the provided content doesn't show the call site.
- `tests/unit/scripts/security/corpus-digest.test.ts`: the unit test. It can import this module directly because the module has no side effects, network access or database access.

## Notes
- `expected` must be lowercase hex. The comparison is a plain string `!==` with no case normalization, so an uppercase digest fails even if the hash is correct.
- Any mismatch throws, so callers should let the error stop the pipeline instead of falling back.
