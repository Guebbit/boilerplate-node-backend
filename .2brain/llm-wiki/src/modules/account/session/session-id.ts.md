---
source: src/modules/account/session/session-id.ts
sha256: 23bf0900c548d61c605ee90fae88b7703673f0fe282bcb1be81a1a43ed5a946d
generated_at: 2026-11-08T04:30:03.699604+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/session-id.ts

## Purpose

Generates and shape-checks opaque session IDs used in `cookie` authentication mode. A session ID is a 256-bit random token (`ses_` + base64url of 32 random bytes) whose **sha256 hash** (via `@infrastructure/security/hash-token`) is what gets persisted, so no plaintext ever leaves the one call-site that creates it. Because the entropy is sufficient, no HMAC or signing secret is required.

## Key elements

- **`newSessionId(): string`** — The single point where a session ID's plaintext exists on the server. Returns `ses_` + 32 random bytes in base64url.
- **`looksLikeSessionId(token: string): boolean`** — Cheap prefix check (`ses_`). Used to short-circuit authentication dispatch before any DB lookup.
- **`looksLikeJwt(token: string): boolean`** — Shape-only regex test for a three-segment base64url token whose header decodes to a JSON object (`eyJ…`). Does **not** verify or decode the payload; that is `jwt` mode's responsibility.

## Relationships

- **`src/kernel/authentication.ts`** — Provides the `SESSION_TOKEN_PREFIX` constant (`ses_`) that this module imports and all three exports depend on for their prefix/regex logic.
- **`src/modules/account/session/cookie-strategy.ts`** — Consumes `newSessionId` to mint a new session and `looksLikeSessionId` to decide whether an incoming credential should be treated as a cookie-mode token.
- **`src/modules/account/session/jwt-strategy.ts`** — Uses `looksLikeJwt` as the first dispatch gate before attempting full JWT verification.
- **`src/modules/account/tests/unit/session-id.test.ts`** — Unit tests covering format, entropy, and the two shape-check predicates.

## Notes

- `looksLikeJwt` is intentionally a *shape* check, not a signature verification. A forged token that matches the regex will still be rejected later by `jwt-strategy`; the regex exists only to route the credential to the right strategy.
- The prefix `ses_` and the `sk_…` API-key prefix are deliberately the same *shape* (prefix + opaque payload) so the kernel can dispatch on structure, but they are semantically different credentials.
- Because only the sha256 hash is stored, a database leak does not expose a usable session token — the attacker would need to brute-force 256 bits.
