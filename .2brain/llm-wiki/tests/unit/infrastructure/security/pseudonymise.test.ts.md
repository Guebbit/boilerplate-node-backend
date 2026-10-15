---
source: tests/unit/infrastructure/security/pseudonymise.test.ts
sha256: 2a7ec6d7246428a36e198690286cb2f1efd3f9e8eb1f9349cac10f325e67a4e1
generated_at: 2026-10-15T13:20:12.798549+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/pseudonymise.test.ts

## Purpose

Unit tests for the `pseudonymise` function, verifying that it produces a stable, 64-hex HMAC-SHA256 digest that is keyed to both a per-purpose domain separator and a root secret, and that it refuses to operate when the root secret is absent.

## Key elements

- **`describe('pseudonymise')`** — top-level suite containing six focused test cases.
- **`beforeEach` hook** — calls `setEnvironment({ NODE_PSEUDONYM_KEY: 'a-root-secret-for-tests' })` so every test starts with a known root key.
- **"is stable and returns a full 64-hex HMAC-SHA256 digest"** — asserts the output matches `/^[\da-f]{64}$/` and is deterministic for the same `(purpose, value)` pair.
- **"differs for different values"** — confirms two distinct inputs under the same purpose yield different digests.
- **"differs per purpose for the same value"** — confirms the purpose string acts as a domain separator; three purposes produce three unique digests.
- **"differs under a different root secret"** — swaps `NODE_PSEUDONYM_KEY` mid-test and asserts the digest changes.
- **"is never the bare or single-key digest of the value"** — asserts the output is *not* `SHA-256(value)` and *not* `HMAC(rootKey, value)`, proving the purpose is folded into the computation.
- **"refuses to digest when the root is unset"** — sets `NODE_PSEUDONYM_KEY` to `undefined` and expects a thrown error matching `/NODE_PSEUDONYM_KEY is not set/u`.

## Relationships

- **`src/infrastructure/security/pseudonymise.ts`** — the module under test; `pseudonymise(purpose, value)` is the sole function exercised.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to inject or clear `NODE_PSEUDONYM_KEY` between test cases.
- **`node:crypto`** (`createHash`, `createHmac`) — imported solely to build expected *negative* digests in the "is never the bare…" test; not part of the SUT.

## Notes

- The call signature is `pseudonymise(purpose: string, value: string)`, where `purpose` is a short tag (e.g. `'log'`, `'rate-limit'`, `'idempotency'`).
- The "is never the bare or single-key digest" test implies the implementation derives a sub-key from the purpose before HMAC (or otherwise composes the key), rather than simply prepending the purpose to the message.
- `setEnvironment` mutates process-level state; the final test sets the key to `undefined` and does **not** restore it in an `afterEach`, relying on the `beforeEach` in the *next* test to reset. This is safe here because the error-throwing test is last, but reordering tests could surface stale state.
