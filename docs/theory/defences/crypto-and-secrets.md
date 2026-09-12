# Cryptography, secrets and transport

Secrets, keys and TLS. The defining property of this family: **failures are silent.** Bad
authorization throws a 403 someone notices; a fixed IV, a fast password hash or a non-constant-time
compare all work perfectly, pass every test, and cost you everything on the day of a dump.

The rule this codebase follows, and the reason most rows below are one line: **never implement a
primitive.** `node:crypto`, `bcrypt`, `jsonwebtoken` — and where a choice exists, the boring one.

## Transport

| Attack                          | How it works                                            | This boilerplate                                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing or optional TLS         | HTTP endpoints, no redirect, cookies sent in the clear  | Not this process's layer — `docker-compose.production.yml` binds the API to loopback, so a TLS-terminating proxy is structurally required rather than merely advised. Recipe: [TLS termination](../../tools/deployment-hardening.md#tls-termination). |
| SSL stripping / downgrade       | no HSTS, no preload; an on-path attacker rewrites links | `helmet()` sets `Strict-Transport-Security` on every response this app sends — `app/security.ts`. Preload registration is the domain owner's: [TLS termination](../../tools/deployment-hardening.md#tls-termination).                                 |
| Weak TLS configuration          | TLS 1.0/1.1, RC4, export ciphers, no forward secrecy    | The terminating proxy's — see [TLS termination](../../tools/deployment-hardening.md#tls-termination).                                                                                                                                                 |
| Certificate validation disabled | `rejectUnauthorized: false`, ignored hostname mismatch  | Nothing in `src/` disables it. Outbound calls use Node's `fetch` with defaults — `account/oauth/providers/`.                                                                                                                                          |
| Certificate / key exposure      | a private key in the repo, in the image, or in backups  | No key material is in the repo; `.dockerignore` keeps `.env` out of the image. The boot gate refuses a still-placeholder secret — `kernel/required-config.ts`                                                                                         |
| Mixed content                   | an HTTPS page loading HTTP subresources                 | The frontend's row — this API serves JSON and its own static files and loads no remote resource.                                                                                                                                                      |

## Hashing passwords

| Attack                   | How it works                                       | This boilerplate                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Weak password hashing    | MD5/SHA-1, unsalted, fast hashes; rainbow tables   | bcrypt, salted by construction, applied in a pre-save hook so a plaintext value never reaches storage — `users/model.ts`                                                                                                                               |
| Insufficient work factor | bcrypt cost too low, PBKDF2 iterations too few     | Cost factor 12, with the rationale written at the call site rather than left as a magic number — `users/model.ts`                                                                                                                                      |
| Timing side channel      | a non-constant-time compare, or an early-exit loop | A login miss compares against a dummy bcrypt hash, so an unknown email costs the same as a wrong password — `account/services/authentication.ts#DUMMY_PASSWORD_HASH`. The metrics credential uses `timingSafeEqual` — `rate-limit.ts#isMetricsScraper` |

**Why bcrypt and not argon2id.** Argon2id is the better primitive and the current OWASP first
choice. bcrypt at cost 12 is well above the threshold where offline cracking is the cheap attack,
and it ships without a native build step that breaks on every Node major. That is a deliberate
trade for a boilerplate, not an oversight — a deployment with a hardware budget should reach for
argon2id.

## Randomness and keys

| Attack                   | How it works                                                  | This boilerplate                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Insecure randomness      | `Math.random`, seeded PRNGs, timestamps used as tokens        | Every token, code, filename, `jti` and IV comes from `node:crypto` — `randomBytes`, `randomUUID` or `randomInt`. Not one of them is `Math.random`.                   |
| Weak key length          | RSA-1024, short HMAC secrets                                  | The boot gate refuses a secret that is unset, too short, or still the shipped placeholder — `kernel/required-config.ts`                                              |
| Hard-coded / shared keys | the same secret across environments, in source, never rotated | Each secret is its own environment variable with its own boot check. Signing-key rotation is documented at [Security](../../tools/security.md#signing-key-rotation). |
| Cross-purpose key use    | one key for signing and encryption, or for access and refresh | Three separate secrets — `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_TOTP_ENCRYPTION_KEY` — each required independently at boot.                                |

## Using a primitive wrongly

| Attack                              | How it works                                                                | This boilerplate                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Encryption without authentication   | CBC without a MAC; ciphertext is malleable                                  | AES-256-**GCM** for the TOTP device secret — an AEAD, so tampering fails the tag rather than decrypting to garbage — `account/two-factor/` |
| Padding oracle                      | different errors for bad padding vs. bad MAC                                | No surface: GCM has no padding, and there is one failure mode.                                                                             |
| ECB mode                            | identical blocks encrypt identically                                        | No surface: GCM only.                                                                                                                      |
| IV / nonce reuse                    | a fixed IV with CTR or GCM reuses the keystream                             | A fresh random IV per encryption, from `node:crypto`, stored alongside the ciphertext — `account/two-factor/`                              |
| Key confusion / algorithm confusion | a verifier uses the wrong primitive — JWT RS/HS                             | `{ algorithms: ['HS256'] }` pinned on every verify — see [JWT](authentication.md#jwt-specifically).                                        |
| Length-extension                    | a MAC forged from `H(secret ‖ message)`                                     | No surface: no homemade MAC. Where a MAC is needed it is HMAC — `account/two-factor/`                                                      |
| Homegrown crypto                    | a custom cipher or a custom token format                                    | None. Every construction above is a library primitive used in its documented mode.                                                         |
| Compression side channel            | CRIME / BREACH — reflecting input next to a secret in a compressed response | No response compression is installed in this process, and no response reflects request input next to a secret.                             |
| Bleichenbacher / ROBOT              | an RSA padding oracle in the TLS library                                    | The terminating proxy's library, not this one's.                                                                                           |

## Secrets at rest

The asymmetry that matters: a value this server must **compare** is hashed; a value it must
**read back** is encrypted. Confusing the two is how a "hashed" secret turns out to be reversible.

| Attack                       | How it works                                       | This boilerplate                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets at rest in plaintext | a database dump equals full compromise             | Refresh, reset, delete-confirmation and backup-code tokens are stored as sha256 digests, never the live value — `users/model.ts#hashToken`. A TOTP device secret must be read back to verify a code, so it is AES-256-GCM under a versioned key instead — `account/two-factor/` |
| Secrets in environment       | `.env` in the repo, `ENV` in a Dockerfile, CI logs | See [Infrastructure](infrastructure.md#a-boot-that-refuses).                                                                                                                                                                                                                    |
| Unencrypted at rest          | no disk or field encryption; backups in plaintext  | Disk-level encryption is the host's. Field-level, the two rows above cover every secret this app stores.                                                                                                                                                                        |

**Why sha256 and not bcrypt for tokens.** A refresh token is 16 random bytes — high-entropy and
one-time. There is no low-entropy secret to stretch, and bcrypt would add a real per-request cost
to every token check for no gain against an offline attacker who cannot guess 128 bits anyway. The
reasoning is written at `users/model.ts:33` rather than left to be re-derived.

## Related

- [Authentication](authentication.md) — what these primitives are holding up
- [Data layer](data-layer.md#secrets-stored-with-the-data) — the same secrets, from the storage side
- [Infrastructure](infrastructure.md) — where the keys come from at boot
- [Security](../../tools/security.md#signing-key-rotation) — the rotation procedure
