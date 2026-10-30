---
source: src/infrastructure/security/pseudonymise.ts
sha256: d14df46023fbf51dc03fa4e9262ffa64384d17a4b7a5747ae91cc39b52591661
generated_at: 2026-10-29T02:16:03.715940+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/pseudonymise.ts

## Purpose

Provides keyed pseudonymisation of identifiers and secrets that must remain comparable across requests but must not be readable or brute-forceable. Uses HMAC-SHA256 under per-purpose subkeys (HKDF-derived from a single root secret) so that a guessable plaintext is protected by key secrecy rather than hash entropy. Serves log fields, rate-limit identities, and the idempotency fingerprint.

## Key elements

- **`PseudonymPurpose`** (exported type) — closed union `'log' | 'rate-limit' | 'idempotency'`; adding a value is a deliberate code change and prevents cross-purpose replay.
- **`subkeyFor(purpose)`** (internal) — calls `pseudonymConfig().NODE_PSEUDONYM_KEY` and `deriveSubkey(root, \`pseudonym/v1/${purpose}\`)`; **throws** if the env var is unset (no built-in fallback key).
- **`pseudonymise(purpose, value)`** (exported) — returns the full 64-char hex HMAC-SHA256 digest. Deterministic: same input → same digest.
- **`correlationDigest(value)`** (exported) — convenience wrapper: `hmac:` + first 12 hex chars of the `'log'`-purpose digest. Used wherever a short, human-visible stand-in for a personal value appears in log lines or audit rows.

## Relationships

- **`./config.ts`** — imports `pseudonymConfig` to read the `NODE_PSEUDONYM_KEY` env var.
- **`./subkey.ts`** — imports `deriveSubkey` (HKDF) to obtain the per-purpose subkey.
- **`adapters/logger.ts`** — *reverse* dependency: logger imports this module (and it sits on Jest's `globalSetup` chain, hence the relative-import-only constraint noted in the header).
- **`http/middlewares/idempotency.ts`** and **`http/middlewares/rate-limit.ts`** — consume `pseudonymise` with their respective purpose to produce keyed identity/fingerprint digests.
- **`modules/audit-logs/presenter.ts`** and **`modules/account/session/login-observability.ts`** — consume `correlationDigest` for short log/audit tokens.
- **`tests/unit/infrastructure/security/pseudonymise.test.ts`** — unit tests for this module.
- **`tests/cross-cutting/crypto-conformance.test.ts`** — cross-cutting conformance checks over the crypto pipeline.

## Notes

- **No silent fallback.** If `NODE_PSEUDONYM_KEY` is unset, `subkeyFor` throws immediately. There is intentionally no built-in key.
- **Truncation is the caller's choice** on `pseudonymise`; only `correlationDigest` hard-codes 12 chars. The `hmac:` prefix is a readability convention signalling the value is keyed.
- **Rotation is all-or-nothing:** a single root secret means one rotation changes every digest across every purpose. See `docs/tools/security.md`.
- **Relative imports only** to avoid a circular dependency through `logger.ts` and to stay on Jest's `globalSetup` import chain.
