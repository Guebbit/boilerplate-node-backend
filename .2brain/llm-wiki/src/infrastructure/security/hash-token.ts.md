---
source: src/infrastructure/security/hash-token.ts
sha256: 97dc735a754103e013376327ede237c149200460f5d3866ff40b2efa3a3a2043
generated_at: 2026-11-08T03:48:52.543607+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/hash-token.ts

## Purpose

Single-purpose leaf module that digests credential-like token values (session ids, refresh tokens, one-time links, API keys) for at-rest storage and lookup. Because it has no project-internal dependencies, any module can hash or retrieve a token without reaching a sibling for the helper.

## Key elements

- **`hashToken(token: string): string`** — the sole export. Computes a lowercase hex SHA-256 digest of the given plaintext token using `node:crypto`'s `createHash`. No salt, no KDF iterations.

## Relationships

This file is a dependency **leaf**: it imports only `node:crypto` and nothing else from the project. Every listed neighbor is a *consumer* that calls `hashToken`:

- **Production consumers** — `tokens.ts`, `logout.ts`, `cookie-strategy.ts`, `jwt-strategy.ts`, `jwt.ts`, `listing.ts` — hash or compare token values before persisting or validating sessions, cookies, and JWTs.
- **Test consumers** — `factories.ts` and the integration/unit test suites under `tests/` — use `hashToken` to build fixture digests or assert stored-value equality.

No file in the graph is imported *by* this module; it has zero outgoing project dependencies.

## Notes

- **Why plain SHA-256, not bcrypt/argon2:** every input already carries ≥ 128 bits of entropy (`crypto.randomBytes` or a signed JWT). A slow KDF would add latency to every authenticated request with no security gain.
- **Comparison contract:** any code that matches an in-memory token against a stored digest *must* run it through `hashToken` first. Comparing raw tokens to stored hex strings will never match.
- **Migration rule:** one-off scripts that rewrite stored token rows must import and call `hashToken` rather than re-implementing the digest, to avoid subtle hex-case or update-ordering drift.
- The function is intentionally synchronous and allocation-light (`createHash` → `update` → `digest`) so it can sit inside hot per-request paths without introducing async hops or large memory allocations.
