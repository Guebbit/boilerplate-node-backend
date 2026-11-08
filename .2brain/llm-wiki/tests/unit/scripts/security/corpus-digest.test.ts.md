---
source: tests/unit/scripts/security/corpus-digest.test.ts
sha256: defd4142a460058534edafc584ed84ed8ec000d84778e3f33a3d4dc51581f8cc
generated_at: 2026-11-08T10:42:48.803996+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/security/corpus-digest.test.ts

## Purpose

Unit tests for `assertCorpusDigest`, the security guard that verifies a corpus byte buffer matches a pinned SHA-256 digest before the corpus is accepted. Ensures the function both accepts valid data and rejects tampered or empty data with a descriptive error.

## Key elements

- **`body` / `digest`** — Module-level constants: a fixed `Uint8Array` (`"123456\npassword\n"`) and its pre-computed SHA-256 hex string. Computed once at import time via `node:crypto` so the happy-path test proves the digest is calculated over raw bytes.
- **`describe('assertCorpusDigest')`** — The test suite containing three cases:
  - *Happy path* — correct bytes + correct digest → no throw.
  - *Altered bytes* — one character changed → throws a message that names the label (`corpus`) and includes both the actual and expected 64-char hex digests.
  - *Empty body* — zero-length `Uint8Array` → throws containing `"Refusing the corpus"`.

## Relationships

- **`scripts/security/corpus-digest.ts`** — The sole production import. This file exercises its exported `assertCorpusDigest(body, expectedDigest, label)` function directly.
- **`node:crypto`** — Used only here in the test to independently compute the expected digest, mirroring the implementation's algorithm and confirming byte-level (not string-level) hashing.

## Notes

- The expected digest is computed **at module scope**, not inside a `beforeEach`, so the test file fails loudly at import time if the algorithm or input ever changes unexpectedly.
- The altered-bytes assertion checks the **full error-message shape** (label, actual hex, expected hex, refusal text) via a strict regex, making it a de-facto contract test for the error format.
- The empty-body test asserts a looser substring (`/Refusing the corpus/u`) because the actual-vs-expected hex comparison is less meaningful when no bytes were supplied.
