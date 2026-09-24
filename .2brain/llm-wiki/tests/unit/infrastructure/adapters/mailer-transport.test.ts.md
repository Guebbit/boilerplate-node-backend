---
source: tests/unit/infrastructure/adapters/mailer-transport.test.ts
sha256: 829ddc5df0b8ed2f40cd336ca856e9fe8ed053c7d3223bed5657a313dc9308f7
generated_at: 2026-09-23T20:19:20.214857+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-transport.test.ts

## Purpose
Unit tests for the SMTP transport configuration and transport-selection logic in the mailer adapter. The file exists to pin down security-critical invariants (TLS mode, test-environment isolation, demo-profile outbox protection) that are easy to regress silently and dangerous to get wrong.

## Key elements
- **`createTransportMock`** – `jest.fn()` that stands in for `nodemailer.createTransport`; every call is recorded so tests can inspect the options object without opening a socket.
- **`transportOptions(environment)`** – helper that (1) clears the mock and resets the transporter, (2) swaps `process.env` to the given values, (3) triggers one `nodemailer(...)` send to force the memoised transport to build, (4) restores env, and returns the captured options.
- **`SMTP_ENVIRONMENT`** – minimal production-mode env (`NODE_ENV: 'production'`, `NODE_SMTP_HOST`) shared across the TLS and credentials suites.
- **"the test environment uses a transport that sends nothing"** – asserts `NODE_ENV=test` yields `{ jsonTransport: true }`, guaranteeing no real mail leaves the test suite.
- **"TLS mode follows the port, which is a security decision"** – asserts `secure` is `true` only on port 465, `false` on 587/25, and the default (no port) is 587 + `secure: false`.
- **"credentials and identity"** – verifies auth passthrough, empty-string fallbacks when user/pass are unset, and `name` defaults to `''` (not `undefined`).
- **`describe('resolveMailTransport')`** – exercises the public `resolveMailTransport()` selector: default → smtp; explicit `smtp`/`log`/`outbox` honoured; unknown value throws; demo profile forces `outbox`; `NODE_ENV=test` forces `log` regardless of deployment setting.

## Relationships
- **`src/infrastructure/adapters/mailer.ts`** – the module under test. Imports `nodemailer` (the send entry-point), `resetTransporter` (clears the memoised transport), and `resolveMailTransport` (the transport-selection function). The `nodemailer` module is mocked via `jest.mock('nodemailer', …)` before the import.
- **`src/infrastructure/runtime/demo-profile.ts`** – `enableDemoProfile()` is toggled in `afterEach` and in one test to verify the demo-profile rail overrides any deployment-named transport.
- **`tests/support/environment.ts`** – `withoutEnvironmentInThisFile(['NODE_MAIL_TRANSPORT', 'NODE_ENV'])` is registered at the top of the `resolveMailTransport` suite so each test starts from a clean "deployment said nothing" state.

## Notes
- The transport is **memoised at module scope**, so the way to reconfigure it is `resetTransporter()` followed by a send—not `jest.resetModules()` + dynamic import. The header comment explicitly calls out that the old reset-and-reimport dance is no longer needed.
- `secure: true` on port 587 would cause a hard connection failure; `secure: false` on port 465 would leak SMTP AUTH credentials in plaintext. The tests treat this as a security invariant, not a config detail.
- Empty-string (`''`) is used for unset `auth.user`, `auth.pass`, and `name` so that nodemailer never serialises the literal string `"undefined"` into the SMTP handshake.
- The `resolveMailTransport` suite uses `it.each` for the three valid transport names and a separate throw-assertion for the invalid case—no silent fallback is permitted.
