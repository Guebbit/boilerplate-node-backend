---
source: scripts/security/corpus-digest.ts
sha256: 3cdda19e3c43db5331c3ef5211bfcdf0a433264c857479b1a37822dab133db03
generated_at: 2026-11-08T03:01:39.836430+00:00
model: ollama:qwen3.8:27b
---

# scripts/security/corpus-digest.ts

## Purpose

Provides a SHA-256 integrity gate for a downloaded corpus. Before the corpus bytes are fed into the breached-password refresh pipeline, this function verifies the digest matches a pinned value; any mismatch aborts processing. It is extracted into its own module so it can be imported (and unit-tested) without triggering the side-effectful import of `refresh-breached-passwords.ts`.

## Key elements

- **`assertCorpusDigest(bytes, expected, label): void`** — Computes the SHA-256 hex digest of `bytes` via `node:crypto` and throws an `Error` if it does not equal the `expected` lowercase-hex string. The `label` parameter is interpolated into the error message for context (e.g. what URL or file was downloaded).

## Relationships

- **`scripts/security/refresh-breached-passwords.ts`** — The intended caller. That module runs network/database work on import; this file is kept separate so the digest check can be exercised in isolation.
- **`tests/unit/scripts/security/corpus-digest.test.ts`** — Unit tests that import `assertCorpusDigest` directly (no network, no DB) and assert the throw/no-throw behavior for matching and mismatching digests.

## Notes

- The comparison is a plain `!==` on hex strings, not a timing-safe compare. This is acceptable here because the check runs locally on trusted bytes against a pinned constant; it is not a public authentication boundary.
- The function is deliberately a *throw* (not a boolean return) so a caller cannot accidentally ignore the result and proceed with an unverified corpus.
- `bytes` must be the exact downloaded body; passing a decoded or re-serialized representation will produce a different digest and cause a spurious rejection.
