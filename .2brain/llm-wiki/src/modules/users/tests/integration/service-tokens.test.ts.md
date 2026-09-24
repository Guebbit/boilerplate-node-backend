---
source: src/modules/users/tests/integration/service-tokens.test.ts
sha256: 5f8d21baabc8447fd137df8253d9498403f01c8d774c82bdc3d46e4850fa1c01
generated_at: 2026-09-23T19:36:01.529882+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/service-tokens.test.ts

## Purpose

Integration tests covering the two token-facing lookups on the users service — `findByEmail` and `consumeToken`. They verify that tokens are returned as a populated array (not `undefined`), that consumption removes exactly the targeted token, that removal is persisted to the database, and that unknown tokens are a safe no-op.

## Key elements

- **`createUserWithTokens`** (local helper) — seeds a user with one `password`-type and one `delete`-type token. Tokens are stored as `hashToken(…)` digests directly on the document, bypassing `tokenAdd`, so they match what production persists.
- **`describe('userService.findByEmail')`** — three cases: basic email lookup, tokens array is non-`undefined` and length-2, and `falsy` for an unknown address.
- **`describe('userService.consumeToken')`** — four cases: the consumed token is gone on re-read, the sibling token survives, the removal is persisted (asserted via a fresh `userRepository.findOneWithCredentials` call), and an unheld token is a no-op.

## Relationships

- **`@modules/users/service`** — the system under test; exercises `findByEmail` and `consumeToken`.
- **`@modules/users/model`** — provides `hashToken` (used to compute the digest the fixture stores) and the `Token` type for casting.
- **`@modules/users/repository`** — `userRepository.findOneWithCredentials` is called in assertions to re-read persisted state after consumption.
- **`@modules/users/tests/factories`** — `createUser` factory used to seed both the simple and token-bearing fixtures.
- **`@tests/setup-test-db`** — `setupTestDb()` runs once at module top-level before any test executes.

## Notes

- The fixture writes `tokens` directly onto the document (not via `tokenAdd`), so it must store the `hashToken` output — plaintext would never match the hashed lookup inside `consumeToken`.
- `findByEmail` is tested through `findOneWithCredentials` specifically because the default `select: false` on the `tokens` relation would leave the array `undefined`; both downstream callers (`reset-request`, `delete-request`) push onto that array, so an `undefined` would throw a `TypeError` one layer away.
- The doc comment references a separate concurrency suite that races `consumeToken`; this file asserts the one-time-use _property_ (token absent after consumption) rather than the race itself.
