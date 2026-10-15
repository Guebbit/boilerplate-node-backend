---
source: src/modules/account/session/session-id.ts
sha256: 23bf0900c548d61c605ee90fae88b7703673f0fe282bcb1be81a1a43ed5a946d
generated_at: 2026-10-15T10:08:35.489649+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/session-id.ts

## Purpose

Generates and classifies opaque session IDs used in `cookie` mode. The ID is 32 random bytes in base64url under the `ses_` prefix; only its SHA-256 is persisted, so a database leak never yields a usable credential. The file also exports cheap shape-checks that let the authentication kernel reject non-matching tokens before any database lookup.

## Key elements

- **`newSessionId(): string`** — Returns a fresh `ses_…` identifier (32 random bytes, base64url). This is the sole moment the plaintext ID exists server-side.
- **`looksLikeSessionId(token: string): boolean`** — `true` when the token starts with `SESSION_TOKEN_PREFIX`. Used as a pre-lookup gate so JWTs, API keys, or noise are rejected without a query.
- **`looksLikeJwt(token: string): boolean`** — `true` when the token matches a three-segment base64url JWT shape (first segment begins with `eyJ`). Shape check only; actual verification belongs to `jwt` mode.

## Relationships

- **`src/kernel/authentication.ts`** — Supplies `SESSION_TOKEN_PREFIX`, the constant that defines the `ses_` prefix used by both `newSessionId` and `looksLikeSessionId`.
- **`src/modules/account/session/cookie-strategy.ts`** — Consumes `newSessionId` to mint a session and `looksLikeSessionId` to decide whether a presented credential should be routed to cookie-mode handling.
- **`src/modules/account/session/jwt-strategy.ts`** — Consumes `looksLikeJwt` as the triage predicate that routes a credential into the JWT verification path.
- **`src/modules/account/tests/unit/session-id.test.ts`** — Unit-tests the three exports above.

## Notes

- The `ses_` prefix is the same shape family as the `sk_…` API-key prefix; the kernel dispatches on prefix, so these checks are intentionally prefix-based rather than full-regex.
- `looksLikeJwt` does **not** validate signatures or expiry — it only confirms the three-segment `eyJ…` shape. Actual verification is the responsibility of the JWT strategy.
- Because only 256 bits of entropy back the ID, a fast hash (SHA-256) is sufficient at storage time; no HMAC or signing secret is involved.
