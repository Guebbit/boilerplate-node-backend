---
source: src/infrastructure/security/hash-token.ts
source_sha256: 97dc735a754103e013376327ede237c149200460f5d3866ff40b2efa3a3a2043
context_sha256: 9d507d17e69bb006409636966f1819a03d969a2ab70fc7a578a7dcad2ae776fc
generated_at: 2026-11-22T03:08:39.179259+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/security/hash-token.ts

## Purpose
Defines the single digest function used to store and look up every credential-like token: session ids, refresh tokens, one-time links and API keys. It is a leaf module, so any module can hash a token without importing a sibling.

## Key elements
- `hashToken(token: string): string`: returns the lowercase hex SHA-256 digest of the plaintext token, using `node:crypto`'s `createHash`.

## Relationships
The neighbors are consumers in the account module, based on the dependency graph:
- Services (`src/modules/account/services/logout.ts`, `src/modules/account/services/tokens.ts`) and session code (`src/modules/account/session/cookie-strategy.ts`, `src/modules/account/session/jwt-strategy.ts`, `src/modules/account/session/jwt.ts`, `src/modules/account/session/listing.ts`) depend on it. The file's own docs say tokens are stored and looked up by digest.
- Test files (`src/modules/account/tests/factories.ts`, the integration tests for auth storage, self-service, service flows, service and session modes, and the unit tests for the cookie strategy, JWT strategy and session id) also depend on it. The graph shows the dependency but not what each test does with it.

## Notes
- Plain SHA-256 is intentional. Every hashed value already has at least 128 bits of entropy (`randomBytes` or a signed JWT), so there is nothing to stretch. A slow hash would only add cost to the request path of every authenticated client.
- Any code that compares an in-memory token to a stored digest must hash it with this function.
- A one-off script that rewrites stored rows must reuse `hashToken` rather than reimplement the digest.
