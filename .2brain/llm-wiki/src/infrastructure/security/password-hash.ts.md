---
source: src/infrastructure/security/password-hash.ts
sha256: 6398373bdd98cf827ee9c88382e3445c84660aa7946db003df39db4f304432d9
generated_at: 2026-11-08T03:49:07.548057+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/password-hash.ts

## Purpose

Wraps Node's built-in `argon2id` (Node 24.7+, `node:crypto`) with project-specific salt generation, PHC-string encoding/decoding, and constant-time comparison. It is the only application-owned layer between the crypto primitive and the rest of the codebase: the cost parameters are externalised to shared YAML so a PHP twin can read the same values.

## Key elements

- **`hashPassword(password)`** — async; derives an argon2id tag with a fresh 16-byte salt and the configured cost, returns a PHC string (`$argon2id$v=19$m=…,t=…,p=…$salt$hash`).
- **`hashPasswordSync(password)`** — same logic via `argon2Sync`; exists solely for the one-at-import-time unknown-email decoy where a Promise adds no value.
- **`verifyPassword(password, stored)`** — parses the PHC string with a strict regex, re-derives with the stored parameters/salt, compares via `timingSafeEqual`; returns `false` (never throws) if the stored value doesn't match the PHC shape.
- **`PHC_PATTERN`** — anchored regex that pins `v=19`, captures `m`, `t`, `p`, salt, and hash (base64, no padding).
- **`MEMORY_KIB` / `PASSES` / `PARALLELISM`** — loaded at module scope from `shared/rules/password-hash.yaml` via `loadSharedRules`; currently 19 MiB / 2 / 1 (OWASP's "≈ 50 ms" profile).
- **`SALT_BYTES = 16`**, **`TAG_BYTES = 32`** — fixed at 128-bit salt (RFC 9106 §3.1) and 256-bit output.
- **`derive`** — `promisify(argon2)`; runs on the threadpool, off the event loop.
- **`parametersFor` / `encode`** — small helpers that build the `node:crypto` options object and serialise the PHC string respectively.

## Relationships

- **`config/shared-rules/load.ts`** — calls `loadSharedRules('password-hash', …)` at import time to resolve the cost triple.
- **`config/shared-rules/password-hash.ts`** — supplies the Zod schema (`passwordHashSchema`) that validates the YAML value before it is destructured.
- **`modules/account/services/login.ts`** / **`modules/account/services/reauth.ts`** — consume `verifyPassword` (and, for the unknown-email path, `hashPasswordSync`) to authenticate credentials.
- **`modules/users/model.ts`** — defines the persisted field that stores the PHC string produced by `hashPassword`.
- **`tests/unit/infrastructure/security/password-hash.test.ts`** — unit tests for hashing, verification, PHC parsing, and constant-time behaviour.
- **`tests/cross-cutting/crypto-conformance.test.ts`** — cross-cutting checks that the output conforms to the PHC spec and that parameter round-tripping is stable.
- **`modules/account/tests/integration/password-hashing.test.ts`** — integration coverage exercising the full login/reauth → verify path.
- **`modules/users/tests/unit/schema-contract.test.ts`** — asserts the stored-hash column shape matches the PHC pattern this module emits.

## Notes

- The stored PHC string is self-describing: `verifyPassword` reads `m`/`t`/`p` from the string itself, so rotating the YAML cost only affects *new* hashes, not verification of existing ones.
- `hashPasswordSync` blocks the event loop for the duration of a derivation (~50 ms at current cost). It is intentionally limited to the single import-time decoy; do not call it in request paths.
- The PHC regex is strict about `v=19` and rejects padding (`=`) in base64 segments; a hash encoded by an older/other implementation will simply fail to match and `verifyPassword` returns `false` without throwing.
- `parallelism` is hard-locked to 1 in the YAML; the code passes it through but the comment notes it buys a defender nothing on a busy server.
