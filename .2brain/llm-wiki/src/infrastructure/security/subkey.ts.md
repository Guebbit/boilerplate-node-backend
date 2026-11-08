---
source: src/infrastructure/security/subkey.ts
sha256: 16449650c05e8ccddea05e4c8a4abc0e0e4860fee009ab94d9f07b0ab6c756f4
generated_at: 2026-11-08T03:50:02.986861+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/subkey.ts

## Purpose

Single entry point for deriving purpose-bound subkeys from a root secret via HKDF-SHA256 (RFC 5869). Enforces the "one root, one purpose" rule (NIST SP 800-57 §5.2) so that a single high-entropy root never directly serves two unrelated cryptographic roles. Results are cached in-process to keep the request path cheap.

## Key elements

- **`deriveSubkey(root: string, info: string): KeyObject`** — the sole export. Derives a 32-byte subkey using `hkdfSync('sha256', root, '', info, 32)` (empty salt, `info` as the purpose label) and wraps the result in an immutable `KeyObject` via `createSecretKey`. Returns the same instance on repeated calls with identical inputs.
- **`derived: Map<string, Map<string, KeyObject>>`** — module-level two-level cache (root → info → KeyObject). Prevents redundant HKDF work within a single process lifetime.

## Relationships

- **`pseudonymise.ts`** — imports and calls `deriveSubkey`; this file is a direct dependency of it.
- **`subkey.test.ts`** — unit tests for `deriveSubkey` (derivation correctness, cache hit/miss, immutability).
- **`crypto-conformance.test.ts`** — cross-cutting test that exercises this module alongside other crypto primitives on the jest `globalSetup` chain.
- **`versioned-secret.ts`** / **`delivered-codes.ts`** — listed as graph neighbors (same infrastructure/security or account/2FA domain) but no import of this file is visible in its source; interaction, if any, is indirect through shared consumers.

## Notes

- The cache is **never invalidated** during a process lifetime. Tests that swap environment values rely on using distinct `root` strings; if a test reuses the same root with different expectations, it will receive the stale cached key.
- `info` is the only separation mechanism—choosing a distinct `info` string is the caller's responsibility for domain separation and scheme versioning.
- The function returns a `KeyObject`, not a `Buffer`; pass it directly to `createHmac` / `createCipheriv` rather than re-encoding.
- The module deliberately uses **relative imports only** (per the file's doc comment) because `pseudonymise.ts` sits on jest `globalSetup`'s resolution chain where absolute/alias imports would break.
