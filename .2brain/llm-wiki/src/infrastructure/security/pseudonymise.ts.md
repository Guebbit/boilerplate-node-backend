---
source: src/infrastructure/security/pseudonymise.ts
sha256: d14df46023fbf51dc03fa4e9262ffa64384d17a4b7a5747ae91cc39b52591661
generated_at: 2026-11-08T03:49:35.473469+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/pseudonymise.ts

## Purpose

Provides keyed pseudonymisation (HMAC-SHA256) for identifiers and secrets that must remain comparable across log lines, rate-limit buckets, and idempotency fingerprints without being human-readable. A bare hash of a guessable value is brute-forceable; binding each digest to an HKDF-derived subkey under a root secret makes offline replay infeasible.

## Key elements

- **`PseudonymPurpose`** (exported type) — Closed union `'log' | 'rate-limit' | 'idempotency'`. Adding a purpose requires a deliberate edit and prevents cross-purpose digest replay.
- **`subkeyFor(purpose)`** (module-private) — Reads `NODE_PSEUDONYM_KEY` from `config.ts`, throws if unset (no built-in fallback), and calls `deriveSubkey` with `info = "pseudonym/v1/<purpose>"` to produce the purpose-specific `KeyObject`.
- **`pseudonymise(purpose, value)`** (exported) — Returns the full 64-char hex HMAC-SHA256 digest of `value` under the purpose subkey. Deterministic: same input → same output. Callers may truncate.
- **`correlationDigest(value)`** (exported) — Convenience wrapper that calls `pseudonymise('log', …)`, truncates to 12 hex chars, and prefixes with `hmac:`. Used in log lines and audit rows so a human can distinguish a keyed digest from a raw hash.

## Relationships

- **`security/config.ts`** — Supplies `pseudonymConfig().NODE_PSEUDONYM_KEY`, the single root secret all subkeys derive from.
- **`security/subkey.ts`** — Provides `deriveSubkey`, the HKDF step that turns the root key + purpose `info` string into the per-purpose HMAC key.
- **`adapters/logger.ts`** — Imports `correlationDigest` to replace personal values in structured log fields (the module doc explicitly notes this import direction to avoid a circular dependency on jest's `globalSetup` chain).
- **`http/middlewares/idempotency.ts`** — Consumes `pseudonymise('idempotency', …)` to produce the request fingerprint.
- **`http/middlewares/rate-limit.ts`** — Consumes `pseudonymise('rate-limit', …)` as the bucket identity.
- **`audit-logs/presenter.ts`** — Calls `correlationDigest` so audit rows show the same short token as the corresponding log lines.
- **`tests/unit/infrastructure/security/pseudonymise.test.ts`** — Unit tests for digest correctness and key-missing error.
- **`tests/cross-cutting/crypto-conformance.test.ts`** — Validates the HMAC/HKDF implementation against reference vectors.

## Notes

- **No default key.** If `NODE_PSEUDONYM_KEY` is absent the call throws immediately. There is intentionally no fallback so a digest under a guessable key is never silently produced.
- **Scheme version is in the `info` string.** `pseudonym/v1/…` means any change to that literal (or to the root key) invalidates every previously stored digest. Rotation is a one-time event; see `docs/tools/security.md`.
- **`correlationDigest` hard-codes purpose `'log'`.** It is *not* a general-purpose shortener; use `pseudonymise` directly when you need a different purpose.
- **Relative imports only.** The module sits on jest `globalSetup`'s require chain, so `logger.ts` → `pseudonymise.ts` must stay a relative (non-package) import to avoid a cycle.
