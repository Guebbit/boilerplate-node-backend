---
source: tests/cross-cutting/crypto-conformance.test.ts
sha256: 8fcf36effc47248a7d564f7e7debb8f78c559544ced3bdbad44186ce8a8ef991
generated_at: 2026-11-14T23:03:09.796506+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/crypto-conformance.test.ts

## Purpose

Cross-language conformance test that asserts this repository's cryptographic primitives (pseudonymisation, HKDF subkey derivation, versioned-secret decryption, and argon2id password verification) produce byte-identical results to the PHP twin. Cases are defined in a shared YAML fixture (`shared/cases/crypto.cases.yaml`) so both stacks validate against the same expected outputs.

## Key elements

- **`cryptoCase`** – Zod discriminated union (discriminator `kind`) with four variants:
  - `pseudonym` – root key + purpose + value → expected hex digest.
  - `subkey` – root + HKDF info → expected hex key.
  - `decrypt` – versioned ring, purpose, AAD, ciphertext → expected plaintext or the sentinel `'reject'`.
  - `verify-password` – password + stored hash → expected boolean.
- **`describeCases('crypto', cryptoCase, …)`** – harness entry point; iterates every YAML case and dispatches on `one.kind` to call the matching implementation and assert equality.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/security/pseudonymise.ts` | Calls `pseudonymise(purpose, value)` for `pseudonym` cases; requires `NODE_PSEUDONYM_KEY` env var set via `setEnvironment`. |
| `src/infrastructure/security/subkey.ts` | Calls `deriveSubkey(root, info)` and hex-exports the result for `subkey` cases. |
| `src/infrastructure/security/versioned-secret.ts` | Calls `decryptVersionedSecret(stored, ring, {purpose, aad}, 'shared case')` for `decrypt` cases. |
| `src/infrastructure/security/password-hash.ts` | Calls `verifyPassword(password, stored)` (async) for `verify-password` cases. |
| `tests/support/cases.ts` | Provides `caseBase` (shared schema fields) and `describeCases` (YAML-driven test runner). |
| `tests/support/environment.ts` | Provides `setEnvironment` to inject `NODE_PSEUDONYM_KEY` before each pseudonym case. |

## Notes

- The `decrypt` case uses the string `'reject'` as a sentinel to mean "expect a throw" rather than a literal expected value; any other string is compared with `toBe`.
- `verify-password` is the only **async** case—the switch arm returns a promise so the `describeCases` harness can `await` it. All other arms use synchronous `expect(…).toBe(…)`.
- `setEnvironment` is called **per case** (inside the `pseudonym` arm), not once before the suite, because the root key can differ between cases.
- The AAD / purpose metadata passed to `decryptVersionedSecret` comes from the case itself, not from a global config, keeping each case self-contained.
