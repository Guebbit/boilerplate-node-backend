---
source: src/infrastructure/security/pseudonymise.ts
source_sha256: a07aa0b84b52a5b1c9f61280c189923e2ba79f2fc1f0c8d03d18136be60a1bf2
context_sha256: 41601f7404cac70a91edc98683e6b85db973565c2793ec4ade36ad895cce640a
generated_at: 2026-11-22T03:09:20.948080+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/security/pseudonymise.ts

## Purpose
Keyed pseudonymisation of identifiers and secrets that must be comparable but not readable: log fields, rate-limit identities and the idempotency fingerprint. It uses HMAC-SHA256 under a per-purpose subkey (HKDF-derived from a single root secret), so a guessable value can't be brute-forced without the key.

## Key elements
- `PseudonymPurpose` — closed union type `'log' | 'rate-limit' | 'idempotency'`. Adding a purpose is a deliberate edit, and digests from one purpose can't be replayed as another's.
- `subkeyFor(purpose)` (internal) — reads `NODE_PSEUDONYM_KEY` via `pseudonymConfig()` and derives a subkey with `deriveSubkey(root, 'pseudonym/v1/<purpose>')`. Throws `Error('NODE_PSEUDONYM_KEY is not set.')` if the key is unset.
- `pseudonymise(purpose, value)` — returns the full HMAC-SHA256 digest as 64 hex characters. Deterministic for the same input; callers may truncate.
- `correlationDigest(value)` — returns `hmac:` plus the first 12 hex chars of `pseudonymise('log', value)`. Used wherever a log line or audit row shows a personal value, so the audit page's digests match the log lines by construction.

## Relationships
- `./config` — supplies `pseudonymConfig()`, the source of `NODE_PSEUDONYM_KEY`.
- `./subkey` — supplies `deriveSubkey`, which does the HKDF derivation and returns a `KeyObject`.
- `src/infrastructure/adapters/logger.ts` imports this file for log-field pseudonymisation. Its tests (`tests/unit/infrastructure/adapters/logger.test.ts`, `tests/cross-cutting/log-redaction-conformance.test.ts`) cover that behaviour.
- `src/infrastructure/http/middlewares/rate-limit.ts` and `src/modules/account/rate-limits.ts` relate to the `rate-limit` purpose.
- `src/infrastructure/http/middlewares/idempotency.ts` relates to the `idempotency` fingerprint purpose.
- `src/modules/audit-logs/presenter.ts` relates to the shared `correlationDigest` so audit rows line up with logs.
- Other graph neighbors that depend on this file or exercise it: `otel-sdk.ts`, `mail-budget.ts`, `login-observability.ts`, `auth-events.test.ts`, `span-client-address.test.ts` and `crypto-conformance.test.ts`.

## Notes
- There is no built-in fallback key. A missing `NODE_PSEUDONYM_KEY` makes every call throw rather than produce a weak digest.
- Rotation is a single value. Rotating the key changes all digests once.
- The module uses relative imports only, because `logger.ts` imports it and it sits on jest `globalSetup`'s import chain.
- The HKDF `info` string includes `v1`, which binds each subkey to this scheme's version as well as to its purpose.
- `correlationDigest` truncates to 12 hex characters, so it is shorter and more collision-prone than the full `pseudonymise` digest. The `hmac:` prefix marks it as keyed.
