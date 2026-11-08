---
source: tests/unit/infrastructure/security/pseudonymise.test.ts
sha256: 2a7ec6d7246428a36e198690286cb2f1efd3f9e8eb1f9349cac10f325e67a4e1
generated_at: 2026-11-08T10:24:49.748895+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/pseudonymise.test.ts

## Purpose

Unit tests that verify `pseudonymise` produces stable, purpose-separated, 64-hex HMAC-SHA256 digests and refuses to operate when the root secret is absent.

## Key elements

- **`beforeEach` hook** — sets `NODE_PSEUDONYM_KEY` to `'a-root-secret-for-tests'` via `setEnvironment` so every test starts with a known key.
- **"is stable and returns a full 64-hex HMAC-SHA256 digest"** — asserts the output matches `/^[\da-f]{64}$/` and is deterministic for identical `(purpose, value)` pairs.
- **"differs for different values"** — two different inputs under the same purpose yield different digests.
- **"differs per purpose for the same value"** — three distinct purposes (`log`, `rate-limit`, `idempotency`) produce three unique digests for the same value.
- **"differs under a different root secret"** — changing the env key mid-test changes the output.
- **"is never the bare or single-key digest of the value"** — asserts the result is *not* a plain SHA-256 of the value and *not* a single-key HMAC-SHA256 with the raw secret (i.e., the implementation must apply additional domain separation).
- **"refuses to digest when the root is unset"** — unsets the key and expects a throw matching `/NODE_PSEUDONYM_KEY is not set/u`.

## Relationships

- **`src/infrastructure/security/pseudonymise.ts`** — the module under test; this file exercises its sole exported function `pseudonymise(purpose, value)`.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to inject or remove `NODE_PSEUDONYM_KEY` between test cases without touching real process env.

## Notes

- The "never the bare or single-key digest" test means the implementation is expected to derive a per-purpose sub-key (or otherwise domain-separate) rather than simply `HMAC-SHA256(rootKey, value)`. A regression that drops domain separation will fail this test.
- Tests mutate the environment via `setEnvironment` and rely on `beforeEach` to reset the key; the "different root secret" test overwrites it inline, so ordering matters if a future test assumes the original key.
