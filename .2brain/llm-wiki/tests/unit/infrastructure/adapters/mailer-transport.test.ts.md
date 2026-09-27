---
source: tests/unit/infrastructure/adapters/mailer-transport.test.ts
sha256: e60bb576a08ad3d182f6f3b6de2cb50c7729f52a4833e7762c39a902568cd1d2
generated_at: 2026-09-27T16:05:13.855988+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-transport.test.ts

## Purpose

Unit tests for the SMTP transport configuration built in `src/infrastructure/adapters/mailer.ts`. Because `NODE_ENV === 'test'` always selects the `jsonTransport` branch, the production SMTP options (port, TLS mode, credentials) were otherwise untested. This file forces that branch to execute and asserts the options object passed to `nodemailer.createTransport`, as well as the guardrails around `resolveMailTransport`.

## Key elements

- **`createTransportMock` / `jest.mock('nodemailer', …)`** — Replaces `createTransport` so tests can inspect the options object without opening a socket.
- **`transportOptions(env)`** — Helper that saves/restores env vars, calls `resetTransporter()`, triggers one `sendTemplatedEmail` (result discarded) to force transport construction, and returns the captured options. This is the only mechanism to vary the memoised transport.
- **`SMTP_ENVIRONMENT`** — Shared minimal env (`NODE_ENV: 'production'`, `NODE_SMTP_HOST`) used as the base for most SMTP option tests.
- **`describe('the test environment …')`** — Asserts `jsonTransport: true` is the sole option under `NODE_ENV=test`.
- **`describe('TLS mode follows the port …')`** — Verifies `secure` is `true` only on port 465, `false` on 587/25/unset; verifies `requireTLS: true` on 587; verifies the default port is 587.
- **`describe('credentials and identity')`** — Verifies `auth` passes through configured values, defaults to `{ user: '', pass: '' }` when unset, and `name` defaults to `''`.
- **`describe('resolveMailTransport')`** — Tests the transport-selection guardrails: default is `'smtp'`; explicit values (`smtp`, `log`, `outbox`) are honoured; unknown values throw; demo profile forces `'outbox'`; production refuses `'outbox'`; test env forces `'log'`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — The module under test. Imports `sendTemplatedEmail`, `resetTransporter`, and `resolveMailTransport`; mocks its dependency `nodemailer`.
- **`src/infrastructure/runtime/demo-profile.ts`** — Imports `enableDemoProfile` to assert that the demo-profile rail overrides the transport to `'outbox'` regardless of `NODE_MAIL_TRANSPORT`.
- **`tests/support/environment.ts`** — Imports `withoutEnvironmentInThisFile` to clear `NODE_MAIL_TRANSPORT` and `NODE_ENV` before each test in the `resolveMailTransport` suite.

## Notes

- The transport is **memoised at first send**, not at import time. Varying its configuration requires `resetTransporter()` followed by a send—`jest.resetModules()` is unnecessary because the module-scope code it would re-run no longer exists.
- `transportOptions` intentionally fires a real `sendTemplatedEmail` call (caught with `.catch(() => {})`) solely to trigger transport construction; the email envelope is irrelevant.
- The `secure` flag is treated as a **security invariant**, not a tunable: `true` means implicit TLS (port 465 only); on 587 the connection must start plaintext and upgrade via STARTTLS, enforced by `requireTLS: true`.
- Credentials default to **empty strings**, not `undefined`, so an unconfigured mailer does not crash at boot but fails at send time.
- In the `resolveMailTransport` suite, `enableDemoProfile(false)` is called in `afterEach` to prevent state leaking between tests.
