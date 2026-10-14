---
source: src/modules/account/session/session-id.ts
sha256: b0cde8e9740e4134f2bffe723589abca2e8f27d57bd8e72e7fdd792848eba674
generated_at: 2026-10-14T09:02:15.425308+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/session-id.ts

## Purpose

Generates and identifies the opaque session ID used in `cookie` authentication mode. The ID is a `ses_`-prefixed string of 32 random bytes (base64url), 256 bits of entropy. Because only its SHA-256 hash is persisted, a database breach yields nothing a client could present, and the high entropy makes a fast hash sufficient—no signing secret is required.

## Key elements

- **`newSessionId(): string`** — Returns a fresh session ID (`ses_` + 32 random bytes, base64url). This is the only point where the plaintext token exists server-side.
- **`looksLikeSessionId(token: string): boolean`** — Cheap prefix check (does `token` start with `SESSION_TOKEN_PREFIX`?) used to reject non-session credentials before any database lookup.

## Relationships

- **`src/kernel/authentication.ts`** — Supplies the `SESSION_TOKEN_PREFIX` constant that both exports reference, keeping the `ses_` prefix definition in one place.
- **`src/modules/account/session/cookie-strategy.ts`** — The cookie-mode strategy that calls `newSessionId` to mint a session and `looksLikeSessionId` to filter incoming credentials before performing a hash lookup.
- **`src/modules/account/tests/unit/session-id.test.ts`** — Unit tests covering generation shape and the `looksLikeSessionId` prefix guard.

## Notes

- The `ses_` prefix is deliberately the same structural shape as `sk_…` API keys; the kernel dispatches on the prefix to route the credential to the correct strategy.
- `looksLikeSessionId` is intentionally a string-prefix check only—it does **not** validate length or alphabet. It is a pre-filter, not a validator.
