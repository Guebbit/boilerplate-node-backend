---
source: tests/cross-cutting/crypto-conformance.test.ts
sha256: 855fa1efbeb4a49c4f871d7103c3152a096a0936c8d0ffb7a54415e575639ee9
generated_at: 2026-11-08T09:26:40.932015+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/crypto-conformance.test.ts

## Purpose

Conformance test that verifies this repository's four crypto primitives produce byte-identical output to the PHP twin, driven by a shared case file (`shared/cases/crypto.cases.yaml`). It guarantees cross-language interoperability for pseudonymisation, HKDF subkey derivation, versioned-secret decryption, and argon2id password verification.

## Key elements

- **`cryptoCase`** — Zod `discriminatedUnion` on the `kind` field; defines the four case shapes (`pseudonym`, `subkey`, `decrypt`, `verify-password`) and their required inputs/expected outputs.
- **`describeCases('crypto', cryptoCase, …)`** — The single test entry point. Switches on `one.kind` and asserts the corresponding primitive's output matches the shared expectation.

## Relationships

- **`src/infrastructure/security/pseudonymise.ts`** — Calls `pseudonymise(purpose, value)` and compares the digest to the case expectation.
- **`src/infrastructure/security/subkey.ts`** — Calls `deriveSubkey(root, info)` and hex-compares the exported key.
- **`src/infrastructure/security/versioned-secret.ts`** — Calls `decryptVersionedSecret(stored, ring, {purpose, aad}, …)`; asserts either a successful decrypt or a thrown rejection.
- **`src/infrastructure/security/password-hash.ts`** — Calls `verifyPassword(password, stored)` (async); asserts the boolean result resolves to the expected value.
- **`tests/support/cases.ts`** — Provides `caseBase` (shared Zod fields every case inherits) and `describeCases` (the harness that loads YAML, validates, and iterates).
- **`tests/support/environment.ts`** — Provides `setEnvironment`, used to inject `NODE_PSEUDONYM_KEY` before each pseudonym case.

## Notes

- The `verify-password` case is the only **async** branch: it returns a promise that the `describeCases` harness awaits. All other branches are synchronous.
- `setEnvironment` is called **per case** inside the `pseudonym` branch; no global setup resets it between cases—rely on the harness or the key being overwritten each time.
- The `decrypt` branch encodes failure as the string `'reject'` in `one.expect` (not a boolean), then asserts `toThrow()`.
- Case data lives outside this file (in the shared YAML), so this file contains no hardcoded vectors—add cases by editing `shared/cases/crypto.cases.yaml`.
