---
source: shared/cases/crypto.cases.yaml
sha256: 3f5901595279d2af7f040f9fefbf908c3b1c7ed9f9308a819929da639cde4cd0
generated_at: 2026-11-08T03:04:53.957978+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/crypto.cases.yaml

## Purpose

A fixed set of test vectors for the project's shared cryptographic primitives (HMAC pseudonyms, HKDF key derivation, AES-256-GCM decryption, and argon2id password verification). It exists so that independent node and server implementations can verify their crypto code against the same known-good outputs without depending on one another's runtime.

## Key elements

- **`kind: pseudonym`** — HMAC-SHA256 under the HKDF subkey `pseudonym/v1/<purpose>`. Produces a 64-hex digest. Cases cover `log`, `rate-limit`, `idempotency` purposes and a non-ASCII (UTF-8) input.
- **`kind: subkey`** — Raw HKDF-SHA256 (empty salt) output as 64-hex. Cases pin the derived keys for the `pseudonym/v1/log`, `pii`, `totp`, and `webhook-secret` ring labels.
- **`kind: decrypt`** — AES-256-GCM stored as `<version>:<iv>:<tag>:<ciphertext>` (all hex). The key is looked up in the `ring` list by stamped version; `purpose` becomes the HKDF `info`; `aad` is bound as GCM additional data. `expect: reject` asserts either an auth-tag failure or a missing version in the ring.
- **`kind: verify-password`** — argon2id PHC-string verification. The stored hash's own parameters (m, t, p) take precedence over any runtime default. Cases include a bcrypt string that must be refused.
- **`root`** — The shared HKDF root secret (`shared-cases-root-secret-do-not-use-in-production-0001`). Public by design; safe to ship.
- **`ring`** — An ordered list of `{version, key}` entries used only by `decrypt` cases. Order does not matter; lookup is by the version stamped in `stored`.

## Relationships

- **shared/cases/log-redaction.cases.yaml** — Sibling case file. The `pseudonym` cases with `purpose: log` here supply the expected digest that the log-redaction implementation must produce for the same input.
- **shared/cases/rate-limit-keys.cases.yaml** — Sibling case file. The `pseudonym` cases with `purpose: rate-limit` here supply the expected digest for rate-limit key derivation.
- Both neighbors share the same `root` secret and the same HKDF derivation scheme defined by the `subkey` cases in this file.

## Notes

- All keys, ciphertexts, and the root secret are **test-only and public**. The name `shared-cases-root-secret-do-not-use-in-production-0001` is intentional; do not reuse it outside tests.
- Ciphertexts were sealed with a **fixed IV** by independent crypto code. This is a deliberate choice so neither side is validating its own output.
- `expect: reject` is ambiguous by design: it covers both a GCM auth-tag mismatch *and* a version that the ring does not contain. Test harnesses should not assert which sub-condition triggered.
- The argon2id `verify-password` cases demonstrate that stored parameters override runtime defaults (e.g., `m=64,t=3` case). Implementations must parse the PHC string rather than re-deriving with local settings.
- Non-ASCII values (`Zoë ☃`, `Zoë Müller`) are hashed/encrypted as their UTF-8 bytes. Implementations that operate on Latin-1 or surrogate-pair-split strings will produce different digests.
