---
source: src/infrastructure/security/password-hash.ts
generated_at: 2026-11-22T03:08:52.845213+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/security/password-hash.ts

## Purpose
Password hashing for the app using argon2id from `node:crypto` (Node 24.7+), with no third-party dependency and no 72-byte input limit. Node provides only the primitive. This file adds the salt, the PHC-string storage format, and a constant-time comparison.

## Key elements
- `hashPassword(password)`: async. It generates a 16-byte random salt and derives a 32-byte tag with the non-blocking `argon2` (threadpool, off the event loop). It returns a PHC string `$argon2id$v=19$m=…,t=…,p=…$<salt>$<hash>` (base64, no padding).
- `hashPasswordSync(password)`: the same output via `argon2Sync`. It is intended only for the value computed at import time (the unknown-email decoy).
- `verifyPassword(password, stored)`: parses `stored` with `PHC_PATTERN`, re-derives using the parameters embedded in the hash, and compares with `timingSafeEqual` (after checking lengths). It resolves `false` if `stored` is not an argon2id v=19 PHC string.
- Module-level constants: `MEMORY_KIB`, `PASSES` and `PARALLELISM` are loaded at import via `loadSharedRules('password-hash', passwordHashSchema)`. `SALT_BYTES` is 16 and `TAG_BYTES` is 32.
- Internal helpers: `parametersFor` builds Node's argon2 parameter object, `encode` serialises a PHC string, and `derive` is the promisified `argon2`.

## Relationships
- `src/infrastructure/config/shared-rules/load.ts` and `src/infrastructure/config/shared-rules/password-hash.ts`: they supply the argon2id cost (`loadSharedRules` plus `passwordHashSchema`). The cost comes from `shared/rules/password-hash.yaml`, which a PHP twin implementation also reads.
- `src/modules/account/services/login.ts` and `src/modules/account/services/reauth.ts`: consumers of the hashing and verification functions.
- `src/modules/users/model.ts`: a neighbor in the dependency graph. The file shows no direct interaction.
- Tests: `tests/unit/infrastructure/security/password-hash.test.ts`, `src/modules/account/tests/integration/password-hashing.test.ts`, `tests/cross-cutting/crypto-conformance.test.ts` and `src/modules/users/tests/unit/schema-contract.test.ts` cover this file or its contract.

## Notes
- Stored hashes carry their own m/t/p and salt, so changing the YAML cost affects only new hashes. Existing hashes still verify with their original parameters.
- Parallelism is one lane by design, per the in-file comment.
- Only `v=19` argon2id strings match. Anything else makes `verifyPassword` return `false`, not throw.
- `verifyPassword` does not bound the embedded `m`/`t`/`p` values. It trusts whatever the stored string declares.
- The PHC pattern's base64 character class is `[\w+/]`, so URL-safe base64 (`-`) is not accepted.
