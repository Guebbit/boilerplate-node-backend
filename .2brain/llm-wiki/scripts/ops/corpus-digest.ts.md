---
source: scripts/ops/corpus-digest.ts
sha256: 3cdda19e3c43db5331c3ef5211bfcdf0a433264c857479b1a37822dab133db03
generated_at: 2026-10-14T07:21:14.950979+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/corpus-digest.ts

## Purpose

Purist integrity gate for a downloaded corpus. Before any corpus bytes are allowed into a committed list, this module verifies their SHA-256 against a pinned digest and throws on mismatch, preventing a moved, truncated, or tampered file from slipping through.

## Key elements

- **`assertCorpusDigest(bytes: Uint8Array, expected: string, label: string): void`** — the sole export. Computes the SHA-256 hex of `bytes` via `node:crypto`, compares it to the lowercase-hex `expected` string, and throws an `Error` (naming `label`, the actual digest, and the expected digest) if they differ.

## Relationships

- **`scripts/ops/refresh-breached-passwords.ts`** — This module was deliberately extracted from that file so the digest check can be imported (and tested) without triggering the side effects (network / database) that `refresh-breached-passwords.ts` performs at import time.
- **`tests/unit/scripts/ops/corpus-digest.test.ts`** — Unit-test suite that exercises `assertCorpusDigest` in isolation, confirming the match-and-throw behavior.

## Notes

- The comparison is a plain string equality (`!==`); both sides are lowercase hex, but there is no normalization (e.g., trimming whitespace) inside the function. Callers are responsible for passing a clean, lowercase digest.
- The file has **no side effects on import**—safe to `require`/`import` in tests without mocking the network or a database.
