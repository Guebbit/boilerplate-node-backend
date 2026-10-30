---
source: src/infrastructure/security/password-hash.ts
sha256: 6398373bdd98cf827ee9c88382e3445c84660aa7946db003df39db4f304432d9
generated_at: 2026-10-29T02:15:48.783812+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/password-hash.ts

## Purpose

Thin wrapper around Node 24.7+'s built-in `argon2id` (`node:crypto`), adding the three things Node does not supply: a random salt, a PHC-string serialisation for storage, and a constant-time comparison for verification. Cost parameters are loaded from a shared YAML rule file so the PHP twin can read the same values.

## Key elements

- **`hashPassword(password: string): Promise<string>`** — Async hash for storage. Generates a 16-byte salt, runs argon2id on the threadpool (promisified `crypto.argon2`), returns a PHC string.
- **`hashPasswordSync(password: string): string`** — Synchronous variant using `argon2Sync`; intended only for the one import-time decoy hash where a promise would just shift the wait.
- **`verifyPassword(password: string, stored: string): Promise<boolean>`** — Parses the stored PHC string (extracting its own m/t/p and salt), re-derives the tag, and compares with `timingSafeEqual`. Returns `false` (not a throw) if `stored` doesn't match the PHC pattern.
- **`MEMORY_KIB`, `PASSES`, `PARALLELISM`** — Cost constants loaded at module load via `loadSharedRules('password-hash', passwordHashSchema)`.
- **`SALT_BYTES = 16`, `TAG_BYTES = 32`** — Fixed sizes (128-bit salt per RFC 9106 §3.1, 256-bit output tag).
- **`PHC_PATTERN`** — Regex that validates and decomposes the `$argon2id$v=19$m=…,t=…,p=…$salt$hash` shape (base64, no padding).

## Relationships

- **`src/infrastructure/config/shared-rules/load.ts`** — Provides `loadSharedRules`, used at import time to read the cost triple from the shared YAML rule.
- **`src/infrastructure/config/shared-rules/password-hash.ts`** — Provides `passwordHashSchema` (the Zod/validator schema) that `loadSharedRules` uses to validate the YAML values.
- **`src/modules/account/services/login.ts`** / **`src/modules/account/services/reauth.ts`** — Consumers of `verifyPassword` for credential checks.
- **`src/modules/users/model.ts`** — Stores the resulting PHC string as the user's password field.
- **`tests/unit/infrastructure/security/password-hash.test.ts`** — Unit tests for hash/verify round-trips and edge cases.
- **`tests/cross-cutting/crypto-conformance.test.ts`** — Cross-cutting tests ensuring conformance (e.g., known-answer vectors).
- **`src/modules/account/tests/integration/password-hashing.test.ts`** — Integration-level tests exercising the hash through the login flow.

## Notes

- The stored PHC string is self-describing: `verifyPassword` reads m/t/p from the string itself, so changing the YAML rule only affects *new* hashes, not verification of old ones.
- `hashPasswordSync` is **not** a general-purpose API; the doc comment restricts it to the single import-time decoy value. Use `hashPassword` everywhere else.
- `verifyPassword` never throws on a malformed `stored` value — it resolves `false`. Callers should not rely on rejection to signal "not a valid hash."
- Parallelism is fixed at 1 by the shared rule; the comment notes this is deliberate for server workloads.
