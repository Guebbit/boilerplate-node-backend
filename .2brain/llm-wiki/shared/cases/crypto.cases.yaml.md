---
source: shared/cases/crypto.cases.yaml
sha256: 6c50b5c7b401b58be2e144bb7aeb18a8ce96608f2ac1f587827ffbfd53f40835
generated_at: 2026-11-14T17:43:56.447571+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/crypto.cases.yaml

## Purpose

Shared, pre-computed crypto test vectors that let independent implementations verify they produce identical results without exchanging live secrets. Ciphertexts were sealed once by independent `node:crypto` code using fixed IVs, so each side checks its own output against the stored digest or plaintext rather than against a sibling's live computation. Every key in this file is **test-only and public**.

## Key elements

- **`cases`** — flat list of test vectors; each entry's `kind` selects the shape:
  - **`pseudonym`** — HMAC-SHA256 under the HKDF subkey `pseudonym/v1/<purpose>`; asserts a 64-hex `digest`. Covers `log`, `rate-limit`, `idempotency` purposes and a non-ASCII (UTF-8) value.
  - **`subkey`** — HKDF-SHA256 with empty salt and a given `info` string; asserts a 32-byte hex `key`. Covers `pseudonym/v1/log`, `pii`, `totp`, `webhook-secret` labels.
  - **`decrypt`** — AES-256-GCM under the ring key named by the stamped `version`. `stored` is `<version>:<iv>:<tag>:<ciphertext>` (hex). `aad` is an opaque input label; `expect` is the plaintext or the literal `reject`. Covers happy-path decrypt, row/purpose mismatch rejection, version-not-in-ring rejection, tampered ciphertext, truncated tag, and multi-ring lookup by version (not list position).
  - **`verify-password`** — argon2id PHC-string check; `expect` is `true`/`false`. Covers correct match, wrong password, self-contained (cheaper) parameters, and a non-argon2id hash.
- **`ring`** (decrypt cases) — ordered list of `{ version, key }` entries; the `version` stamped in `stored` selects the key, regardless of list position.

## Relationships

- **`shared/cases/log-redaction.cases.yaml`** — consumes the `pseudonym` cases with `purpose: log` (same root secret, same 64-hex digest) as the canonical vector for log-field redaction tests.
- **`shared/cases/rate-limit-keys.cases.yaml`** — consumes the `pseudonym` cases with `purpose: rate-limit` as the canonical vector for rate-limit key derivation tests.

Both neighbors are sibling fixtures in the same `shared/cases/` directory and rely on this file as the single source of truth for the crypto primitives they exercise.

## Notes

- All keys, roots, and IVs are **public test fixtures**; the naming (`do-not-use-in-production`) is a safety marker, not a functional constraint.
- Fixed IVs are intentional here (deterministic vectors), **not** a pattern to copy into production sealing code.
- `aad` in `decrypt` cases is an **opaque input string** for the test runner. Real AAD labels are built per-twin from each side's own storage layout (`<namespace>:<field path>:<owning id>`); a value in this file is not a contract on the real label format.
- Ciphertext `stored` format is colon-delimited hex: `version : iv : tag : ciphertext`. A truncated tag (the `dc4c35ce` case) must be rejected, not accepted as a short tag.
- For `verify-password`, the parameters encoded in the PHC string **override** any runtime default (e.g., the `m=64,t=3` case still verifies).
- Non-ASCII values (`Zoë ☃`, `Zoë Müller`, `pässwörd ☃`) are specified as UTF-8; implementations must byte-level hash/encrypt, not rely on a locale-dependent encoding.
