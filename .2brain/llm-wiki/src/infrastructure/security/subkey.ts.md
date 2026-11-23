---
source: src/infrastructure/security/subkey.ts
source_sha256: 0fcab05f434ba02a950aa7f274d0b5fd1477dcc12ab2daaeb77bc14378728e67
context_sha256: c86f1d2c304e0ff525ae2b56c13601c9263c41aeed8474804f2c1190b007f4e2
generated_at: 2026-11-22T03:09:43.885788+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/security/subkey.ts

## Purpose
Single entry point for HKDF key derivation. It derives a purpose-bound 32-byte subkey from a root secret and caches the result. This keeps one root secret from serving two purposes (NIST SP 800-57 §5.2), with the `info` label providing the separation.

## Key elements
- `deriveSubkey(root: string, info: string): KeyObject` is the only export.
  - It uses HKDF-SHA256 (RFC 5869) with an empty salt, `info` as the purpose label, and 32 bytes of output.
  - It wraps the output with `createSecretKey`, so the result is an immutable `KeyObject` that `createHmac` and `createCipheriv` accept directly.
  - It returns the same instance for the same `(root, info)` pair.
- `derived` is a module-private `Map<root, Map<info, KeyObject>>` cache.

## Relationships
- `pseudonymise.ts` imports this module, per the header comment.
- The header says the file sits on jest `globalSetup`'s chain. For that reason it uses relative imports only.
- `versioned-secret.ts` and `delivered-codes.ts` are graph neighbors. The file content doesn't show how they use it.
- `tests/unit/infrastructure/security/subkey.test.ts` and `tests/cross-cutting/crypto-conformance.test.ts` test it.

## Notes
- The cache is keyed on `root` first because tests change the environment between cases. A different root therefore never returns a stale key.
- The cache is unbounded and never evicts. Raw root secret strings are held as Map keys for the life of the process.
- `info` can carry a scheme version where wanted, so a new version derives a different key.
- The salt is deliberately empty because the roots are already high-entropy.
- Keep imports in this file relative. Path aliases are avoided because of the jest `globalSetup` chain.
