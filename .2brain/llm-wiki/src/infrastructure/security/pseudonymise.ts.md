---
source: src/infrastructure/security/pseudonymise.ts
sha256: 75730f4e4a794d56d79e58d0bdf911af68bb435aea771831639d06590112bb3a
generated_at: 2026-10-14T08:17:14.726766+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/pseudonymise.ts

## Purpose

Provides keyed pseudonymisation (HMAC-SHA256) so that identifiers and secrets can be compared for equality without being human-readable. Used for log fields, rate-limit identities, and the idempotency fingerprint. A keyed scheme prevents brute-forcing of guessable values; only a holder of the root secret can reproduce or test digests.

## Key elements

- **`PseudonymPurpose`** (exported type) — Closed union `'log' | 'rate-limit' | 'idempotency'`. Adding a purpose requires a deliberate edit and prevents cross-purpose replay.
- **`pseudonymise(purpose, value)`** (exported) — Returns the full 64-character hex HMAC-SHA256 digest of `value` under the purpose-specific subkey. Deterministic: same input → same digest.
- **`subkeyFor(purpose)`** (internal) — Reads `NODE_PSEUDONYM_KEY` via `pseudonymConfig()`, throws if unset, then calls `deriveSubkey` with `info` of `pseudonym/v1/<purpose>`. No built-in fallback key exists.

## Relationships

- **`src/infrastructure/security/config.ts`** — This file imports `pseudonymConfig` to read the root key.
- **`src/infrastructure/security/subkey.ts`** — This file imports `deriveSubkey` (HKDF) to obtain per-purpose subkeys.
- **`src/infrastructure/adapters/logger.ts`** — Imports `pseudonymise` (noted in the module doc-comment; the relative-import constraint exists to keep this file on jest `globalSetup`'s chain).
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Consumes `pseudonymise` with purpose `'rate-limit'`.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — Consumes `pseudonymise` with purpose `'idempotency'`.
- **`src/modules/account/mail-budget.ts`**, **`src/modules/account/session/login-observability.ts`**, **`src/modules/audit-logs/service.ts`** — Downstream consumers (log-field pseudonymisation).
- **`src/modules/account/tests/integration/auth-events.test.ts`** — Integration test that exercises pseudonymised output in auth-event flows.
- **`tests/unit/infrastructure/security/pseudonymise.test.ts`** — Unit tests for this module.

## Notes

- **Relative imports only.** The module sits on jest `globalSetup`'s dependency chain; absolute or path-alias imports would break that setup.
- **No key = no digest.** If `NODE_PSEUDONYM_KEY` is unset, `pseudonymise` throws rather than falling back to an unkeyed hash.
- **Rotation is all-or-nothing.** Changing the single root key invalidates every existing digest at once (see `docs/tools/security.md`).
- **Callers may truncate** the 64-char hex digest, but the full value is what `pseudonymise` returns.
