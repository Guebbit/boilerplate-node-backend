---
source: src/infrastructure/security/hash-token.ts
sha256: 97dc735a754103e013376327ede237c149200460f5d3866ff40b2efa3a3a2043
generated_at: 2026-10-14T08:16:14.918885+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/hash-token.ts

## Purpose

Single-purpose leaf module that provides the one canonical SHA-256 digest used for every stored credential-like value (session IDs, refresh tokens, one-time links, API keys). Because it depends only on `node:crypto`, any module can hash or look up a token without coupling to a sibling service.

## Key elements

- **`hashToken(token: string): string`** — The sole export. Computes a lowercase hex SHA-256 digest of the input string. Intended for both *storing* a token's digest and *verifying* a plaintext token against that digest (callers hash the candidate identically before comparing).

## Relationships

- **Consumed by session/account services** — `tokens.ts`, `cookie-strategy.ts`, `jwt-strategy.ts`, `jwt.ts`, `listing.ts`, and `logout.ts` call `hashToken` to persist or validate session identifiers and refresh tokens.
- **Tested indirectly** — Unit tests (`session-jwt.test.ts`, `cookie-strategy.test.ts`, `session-id.test.ts`) and integration tests (`auth-storage.test.ts`, `service-flows.test.ts`, etc.) exercise the hashing path through the services above; `factories.ts` likely produces fixtures that flow through it.

## Notes

- Deliberately **not** a slow/iterative hash (bcrypt, argon2). The rationale documented in the file: every input already carries ≥ 128 bits of entropy (`randomBytes` or a signed JWT), so stretching is unnecessary and a slow KDF would tax the hot request path.
- **Comparison rule:** any code that checks a plaintext token against a stored value *must* run `hashToken` on the candidate first. Re-implementing the digest elsewhere (e.g. a migration script) is an explicit anti-pattern called out in the doc comment.
- Output is always **lowercase hex** (64 chars); downstream comparisons should be case-insensitive-safe or rely on this guarantee.
