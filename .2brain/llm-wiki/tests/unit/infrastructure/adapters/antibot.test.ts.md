---
source: tests/unit/infrastructure/adapters/antibot.test.ts
sha256: 5296d9c9dc86a8d2b0f8f75c400d871dbfac6d663088f0bc9d4de05e73c231bf
generated_at: 2026-11-08T10:05:35.554817+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/antibot.test.ts

## Purpose

Unit tests for `checkEmailPolicy`, the email-anti-bot resolver exposed by the `antibot` adapter. Verifies default-off behavior, the `disposable` blocklist posture (with allow/deny override lists), and the `mx` DNS-verification posture, including its RFC 5321 A/AAAA fallback and fail-open semantics on transient DNS errors.

## Key elements

- **`checkEmailPolicy`** — imported from `@infrastructure/adapters/antibot`; the sole function under test.
- **`mockedResolveMx` / `mockedResolve4` / `mockedResolve6`** — `jest.fn()` placeholders that stand in for the DNS resolver's methods, keeping the suite network-free.
- **`jest.mock('node:dns/promises', …)`** — replaces the entire DNS module; the mock's `Resolver` constructor pushes its options into a `resolverOptions` array so a later test can assert `{ timeout: 2000, tries: 1 }`.
- **`dnsError(code)`** — tiny helper producing an `Error` with a `code` property, mirroring how Node reports DNS failures (`ENOTFOUND`, `ENODATA`, `ETIMEOUT`, `ESERVFAIL`).
- **`describe('checkEmailPolicy')`** — main suite; sub-describes cover `disposable`, `mx`, default (off), and unrecognised-policy rejection.
- **`describe('the MX lookup')`** — single test that reads back the captured resolver options via `jest.requireMock`.
- **`setEnvironment`** (from `@tests/environment`) — sets `NODE_ANTIBOT_EMAIL_POLICY`, `NODE_ANTIBOT_EMAIL_ALLOWLIST`, and `NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA` per test.

## Relationships

- **`src/infrastructure/adapters/antibot.ts`** — the module under test; this file imports `checkEmailPolicy` and exercises every documented branch of that function.
- **`tests/support/environment.ts`** — provides `setEnvironment`, which this file calls in `beforeEach`/inline to configure (and implicitly restore) the env vars the adapter reads.

## Notes

- No memoisation or registry reset is needed here (unlike the payment/analytics adapter tests): the policy value is read from the environment on every call, so restoring the touched vars is sufficient.
- The adapter constructs its DNS resolver **at import time**, before the test file's `const` mocks exist. The `jest.mock` factory therefore captures constructor arguments in a local `resolverOptions` array; the final test reads that array back with `jest.requireMock`.
- `beforeEach` pre-stubs `mockedResolveMx` to **reject** with a sentinel error. Any test that unexpectedly triggers an MX lookup will fail loudly rather than silently passing.
- The `mx` posture is deliberately **fail-open**: `ETIMEOUT`, `ESERVFAIL`, and a missing fallback (A/AAAA) all resolve to `'ok'`, while only a definitive negative answer (`ENOTFOUND`, null MX per RFC 7505, or no address at all) yields `'refused'`.
- A null-MX record (`exchange: ''`) is refused even when an A record is present, per RFC 7505 — an explicit test guards against regression.
