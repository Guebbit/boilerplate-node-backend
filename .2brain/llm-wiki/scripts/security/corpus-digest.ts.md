---
source: scripts/security/corpus-digest.ts
sha256: 3cdda19e3c43db5331c3ef5211bfcdf0a433264c857479b1a37822dab133db03
generated_at: 2026-10-14T14:32:56.297020+00:00
model: ollama:qwen3.8:27b
---

# scripts/security/corpus-digest.ts

## Purpose

Provides a pure SHA-256 integrity check for a downloaded corpus. It exists as a separate module so that test suites can import and exercise the verification logic without triggering the side effects (network calls, database writes) that `refresh-breached-passwords.ts` performs on import.

## Key elements

- **`assertCorpusDigest(bytes, expected, label)`** (exported) — Computes the SHA-256 hex digest of `bytes` (a `Uint8Array`) via `node:crypto` and throws an `Error` if it does not match the `expected` lowercase-hex string. The thrown message names the `label`, the actual digest, and the expected digest.

## Relationships

- **`scripts/security/refresh-breached-passwords.ts`** — The production caller. `refresh-breached-passwords.ts` imports `assertCorpusDigest` to validate a downloaded corpus before processing it. The digest check lives here (not in that file) specifically so it can be unit-tested in isolation.
- **`tests/unit/scripts/security/corpus-digest.test.ts`** — Unit tests for `assertCorpusDigest`; they can load this module without any network or database dependency.

## Notes

- The function is intentionally a no-side-effect assertion: it either returns `undefined` or throws. Callers must wrap it in a try/catch or let the error propagate.
- The expected digest must be **lowercase** hex; the comparison is a strict string equality, so an uppercase pinned value will always fail.
- No truncation or streaming is performed — the entire `Uint8Array` is fed into the hash in one `update()` call.
