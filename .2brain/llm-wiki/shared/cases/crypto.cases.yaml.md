---
source: shared/cases/crypto.cases.yaml
source_sha256: c8c126afb7b707d7852fa36c80eead3b5cdfdaebb69d33ea46e8858947b13cd6
context_sha256: b71d23ce9d2c321c29defd5b46afb9a26fd3ba72d0092d91adea8a71a32d0965
generated_at: 2026-11-22T02:21:07.915755+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/cases/crypto.cases.yaml

## Purpose
Shared, language-neutral test vectors for the project's crypto primitives. Each "twin" implementation loads this file and must reproduce the expected output. Ciphertexts were sealed with a fixed IV by independent `node:crypto` code, so no implementation validates itself against its own output. All keys and secrets are TEST-ONLY and public.

## Key elements
A top-level `cases:` list. Each case has a `name` and a `kind` that determines its shape:
- **`pseudonym`**: HMAC-SHA256 under the HKDF subkey `pseudonym/v1/<purpose>`. Fields: `root`, `purpose`, `value`, `digest` (64 hex). Covers the `log`, `rate-limit` and `idempotency` purposes, which give unrelated digests for the same value. Also covers a non-ASCII value hashed as UTF-8 bytes.
- **`subkey`**: HKDF-SHA256 with empty salt. Fields: `root`, `info`, `key` (32 bytes, hex). Covers `pseudonym/v1/log`, `pii`, `totp` and `webhook-secret`.
- **`decrypt`**: AES-256-GCM on `stored` = `<version>:<iv>:<tag>:<ciphertext>` (hex). The key is the HKDF subkey of the ring entry named by the version, with `info` = `purpose`, and AAD-bound. Fields: `ring` (list of `{version, key}`), `purpose`, `aad`, `stored`, `expect` (plaintext, or `reject`). Positive cases cover pii, totp, webhook-secret and non-ASCII plaintext. Reject cases cover:
  - wrong row (AAD mismatch)
  - wrong purpose
  - a version missing from the ring
  - a flipped ciphertext byte
  - a truncated auth tag
- **`verify-password`**: argon2id PHC string. Fields: `password`, `stored`, `expect` (boolean). Covers a correct password, a wrong password, a cheaper old-parameter hash that still verifies, and a stored value that is not an argon2id PHC string, which never verifies.

## Relationships
The neighbors `shared/cases/log-redaction.cases.yaml` and `shared/cases/rate-limit-keys.cases.yaml` are sibling case files. The `log` and `rate-limit` pseudonym purposes here correspond to those domains by name. `scripts/audit/compliance-rules.yaml` is a related graph neighbor. This file shows no direct reference to any of the three.

## Notes
- Ring lookup is by the stamped version, not by position (the ring `[v2, v1]` still opens a `v1` ciphertext).
- `aad` is an opaque input. Each twin builds its own labels from its own storage (`<namespace>:<field path>:<owning id>`), so a case's label does not promise anything about a real one. Ciphertext never moves between twins.
- For `verify-password`, the stored parameters win over any current default.
- `expect: reject` means either the auth tag or the key lookup must fail.
