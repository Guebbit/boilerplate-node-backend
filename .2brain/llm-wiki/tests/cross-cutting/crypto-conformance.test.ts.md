---
source: tests/cross-cutting/crypto-conformance.test.ts
sha256: abe97d9c3a77e356d699254fb5f7ec7e104bcde93bb50aa3ef9b1a7521e4da04
generated_at: 2026-10-29T06:45:37.254046+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/crypto-conformance.test.ts

## Purpose

Cross-cutting conformance test that verifies the TypeScript repo's four crypto primitives (pseudonymisation, HKDF subkey derivation, versioned-secret decryption, and argon2id password verification) produce byte-identical results to the PHP twin. Both repos load the same fixture set (`shared/cases/crypto.cases.yaml`) and must agree on every case.

## Key elements

- **`cryptoCase`** — Zod discriminated union (on `kind`) defining the four supported case shapes: `pseudonym`, `subkey`, `decrypt`, `verify-password`.
- **`describeCases('crypto', cryptoCase, 22, …)`** — Registers 22 parameterised cases from the shared YAML fixture. The inline callback switches on `kind` and asserts the corresponding primitive's output.
- **`pseudonym` branch** — Sets `NODE_PSEUDONYM_KEY` via `setEnvironment`, then asserts `pseudonymise(purpose, value)` equals the expected digest.
- **`subkey` branch** — Asserts `deriveSubkey(root, info)` hex export matches the expected key.
- **`decrypt` branch** — Calls `decryptVersionedSecret` with a key ring, purpose, and AAD; expects either a thrown error (`expect === 'reject'`) or the plaintext string.
- **`verify-password` branch** — Async: returns `expect(verifyPassword(…)).resolves.toBe(boolean)`.

## Relationships

- **`src/infrastructure/security/pseudonymise.ts`** — Source of `pseudonymise`; the function under test for the `pseudonym` kind.
- **`src/infrastructure/security/subkey.ts`** — Source of `deriveSubkey`; the function under test for the `subkey` kind.
- **`src/infrastructure/security/versioned-secret.ts`** — Source of `decryptVersionedSecret`; the function under test for the `decrypt` kind.
- **`src/infrastructure/security/password-hash.ts`** — Source of `verifyPassword`; the function under test for the `verify-password` kind.
- **`tests/support/cases.ts`** — Provides `caseBase` (shared Zod base fields) and `describeCases` (fixture-loading test harness).
- **`tests/support/environment.ts`** — Provides `setEnvironment` to inject `NODE_PSEUDONYM_KEY` before each pseudonym case.

## Notes

- The 22-case count is hard-coded in the `describeCases` call; adding a case to the shared YAML without bumping this number will cause a test failure (mismatch detected by the harness).
- The `pseudonym` branch **mutates global environment** via `setEnvironment`; ordering between cases is not isolated per-case for this variable.
- The `verify-password` branch is the only **async** path (returns a Promise); the harness is expected to await it. All other branches are synchronous.
- The `decrypt` branch distinguishes "should throw" from "should return string" using the `expect` field's value (`'reject'` vs. a string), not a boolean.
