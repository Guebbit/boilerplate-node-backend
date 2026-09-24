---
source: tests/unit/infrastructure/adapters/antibot.test.ts
sha256: 83e29a443e508e249c7ab94041c4fcc6a7840864fcb7f6ebf170609588e3f9d2
generated_at: 2026-09-23T20:16:18.642097+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/antibot.test.ts

## Purpose

Unit tests for `checkEmailPolicy` (the `NODE_ANTIBOT_EMAIL_POLICY` resolver). Verifies the three postures — off-by-default, `disposable`, and `mx` — including the allowlist / extra-denylist overrides and the DNS-MX lookup path, all without touching the network.

## Key elements

- **`mockedResolveMx`** — `jest.mocked(resolveMx)` from `node:dns/promises`; set to reject in `beforeEach` so any accidental real lookup fails loudly. Only the `mx`-policy tests override this.
- **`restoreEnv(key, value)`** — helper that restores an env var to its pre-test value, or deletes the key if it was originally absent.
- **`describe('checkEmailPolicy')`** — top-level suite; captures the three relevant env vars once and restores them in `afterEach`.
- **`describe('policy: disposable')`** — covers blocklist hit/miss, `NODE_ANTIBOT_EMAIL_ALLOWLIST` override, `NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA` override, and confirms no MX check is performed.
- **`describe('policy: mx')`** — covers blocklist short-circuit (no DNS call), empty MX result, MX lookup failure (NXDOMAIN), and a successful MX record.

## Relationships

- **`src/infrastructure/adapters/antibot.ts`** — the module under test. This file imports `checkEmailPolicy` from it and exercises every branch keyed off `NODE_ANTIBOT_EMAIL_POLICY`.

## Notes

- No provider-registry reset is needed here (unlike the payment/analytics adapter tests); the policy is read from `process.env` on each call, so restoring the three env vars is sufficient.
- The `beforeEach` default of `mockedResolveMx` rejecting is a guard: if a test outside the `mx` block accidentally triggers a DNS lookup, it will surface immediately rather than hanging or hitting a real resolver.
- The "off by default" test uses a disposable-domain address (`@mailinator.com`) specifically to prove that *no* filtering runs when the policy env var is unset.
