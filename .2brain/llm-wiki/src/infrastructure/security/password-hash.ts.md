---
source: src/infrastructure/security/password-hash.ts
sha256: 1b55303bee0cb73769283ab5738674230bfc5d74e951ccd7302a7df2d79c2898
generated_at: 2026-10-14T08:16:36.659494+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/password-hash.ts

## Purpose

Provides the application's password hashing and verification layer on top of Node 24.7+'s built-in `argon2`/`argon2id` primitive. It owns the three things Node does not: salt generation, PHC-string encoding/decoding, and a constant-time comparison. Cost parameters follow OWASP's second argon2id profile (~19 MiB, 2 passes, 1 lane), targeting < 50 ms per derivation.

## Key elements

- **`hashPassword(password): Promise<string>`** — Async. Generates a 16-byte random salt, derives a 32-byte tag with argon2id (off the event loop via the threadpool), and returns a PHC string (`$argon2id$v=19$m=…,t=…,p=…$salt$hash`, unpadded base64).
- **`hashPasswordSync(password): string`** — Synchronous variant intended solely for the unknown-email decoy computed at module import time, where awaiting a promise would just shift the delay.
- **`verifyPassword(password, stored): Promise<boolean>`** — Parses the stored PHC string with `PHC_PATTERN`, re-derives using the salt and parameters *from the stored string* (not the module constants), and compares in constant time via `timingSafeEqual`. Returns `false` (never throws) if the stored value does not match the expected PHC shape.
- **`PHC_PATTERN`** — Anchored regex that captures memory, passes, parallelism, salt, and hash from a PHC string.
- **`encode` / `parametersFor`** — Internal helpers that serialise a `Derivation` object into a PHC string or into Node's `argon2` options object, respectively.
- **Constants** — `MEMORY_KIB` (19 456), `PASSES` (2), `PARALLELISM` (1), `SALT_BYTES` (16, per RFC 9106 §3.1), `TAG_BYTES` (32).

## Relationships

- **`src/modules/account/services/login.ts`** — Calls `verifyPassword` (and likely `hashPassword`) to authenticate a login attempt.
- **`src/modules/account/services/reauth.ts`** — Calls `verifyPassword` to gate re-authentication flows.
- **`src/modules/users/model.ts`** — Defines the user record that stores the PHC string produced by `hashPassword`.
- **`tests/unit/infrastructure/security/password-hash.test.ts`** — Unit tests for all three exports.
- **`src/modules/account/tests/integration/password-hashing.test.ts`** — Integration tests exercising this module through the account services.
- **`src/modules/users/tests/unit/schema-contract.test.ts`** — Asserts the stored-hash field's shape against the user schema.

## Notes

- Verification is **parameter-independent**: `verifyPassword` reads memory/passes/parallelism from the stored string, so changing the module constants affects only *new* hashes.
- `hashPasswordSync` is **not** a general-purpose alternative; it exists for exactly one call-site (the import-time decoy) where an async call would be pointless.
- The PHC format uses **unpadded base64** (padding `=` characters are stripped via `replaceAll`).
- `verifyPassword` guards against length mismatch before calling `timingSafeEqual` to avoid a runtime throw on differently-sized buffers.
- No external hashing dependency (e.g. `argon2` npm package) is required; everything comes from `node:crypto`.
