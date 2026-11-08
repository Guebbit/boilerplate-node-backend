---
source: tests/unit/infrastructure/adapters/mailer-transport.test.ts
sha256: 90795c8fe527fba7a0c79ca2dbfd32c1e05d3d56e961ca1281c1254c163184b8
generated_at: 2026-11-08T10:09:15.261034+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-transport.test.ts

## Purpose

Unit tests for the SMTP transport configuration and the `NODE_MAIL_TRANSPORT` selection mechanism. The suite verifies that TLS mode is correct per port (a security decision, not just a setting), that credentials and identity defaults are safe, that the nodemailer transport disables file/URL access from message content, and that `resolveMailTransport` / `mailDelivers` behave correctly for every registered transport and for unrecognised values. The entire `nodemailer` module is mocked so no socket is ever opened.

## Key elements

- **`jest.mock('nodemailer', …)` / `createTransportMock`** — replaces `createTransport` with a spy that returns `{ sendMail: jest.fn() }`, letting tests assert on the options object without any network I/O.
- **`transportOptions(environment)`** — helper that clears the mock, calls `resetTransporter()`, sets the given env, triggers one `sendTemplatedEmail` call (envelope is irrelevant), and returns the first options argument passed to `createTransport`.
- **`SMTP_ENVIRONMENT`** — minimal env record (`NODE_MAIL_TRANSPORT: 'smtp'`, `NODE_SMTP_HOST`) reused across SMTP-related tests.
- **TLS-mode describe block** — asserts `secure: true` only on port 465, `secure: false` + `requireTLS: true` on 587, `secure: false` on other ports, and the 587 default when no port is set.
- **Credentials & identity describe block** — asserts auth passthrough, empty-string fallback (not `undefined`) for user/pass, and `name: ''` when `NODE_SMTP_NAME` is unset.
- **`resolveMailTransport` describe block** — verifies default-to-smtp, explicit `log`/`outbox` selection, and that an unrecognised value throws rather than silently falling back.
- **`mailDelivers` describe block** — table-driven tests for the "does this transport actually reach a person" predicate across all transport names, missing hosts, blank values, unparseable slices, and case/padding variants.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — `sendTemplatedEmail` is called solely to trigger lazy transport construction so the mock captures the options.
- **`src/infrastructure/adapters/smtp-transport.ts`** — `resetTransporter` clears the memoised transport between test cases so the next send rebuilds with new env.
- **`src/infrastructure/adapters/mail-transports.ts`** — source of `resolveMailTransport` and `mailDelivers`, the two functions under test in the last two describe blocks.
- **`src/infrastructure/adapters/config.ts`** — `mailConfig.readIn` / `mailConfig` provide the parsed config slice that `mailDelivers` and `resolveMailTransport` consume.
- **`scenarios/support/doubles/mail-log.ts`** — `logMailTransport` imported for identity assertion in the `resolveMailTransport` test.
- **`scenarios/support/doubles/mail-outbox.ts`** — `outboxMailTransport` imported for the same purpose.
- **`tests/support/environment.ts`** — `setEnvironment` and `withoutEnvironmentInThisFile` isolate per-test and per-describe-block env state.

## Notes

- The suite's default transport is the `log` double (registered by `tests/support/setup-environment.ts`); the `smtp` branch is exercised only by explicitly setting `NODE_MAIL_TRANSPORT: 'smtp'` while `nodemailer` remains mocked. No real socket opens in any test.
- `transportOptions` deliberately uses `resetTransporter()` + a send rather than `jest.resetModules()` + dynamic import, because the transport is memoised on first *use*, not at module scope.
- `disableFileAccess` / `disableUrlAccess` are asserted on the transport options because that is the only layer where message content cannot override them.
- Empty-string credentials (`{ user: '', pass: '' }`) are intentional: email is not a hard boot dependency, so the failure surfaces at send time, not process start.
- `withoutEnvironmentInThisFile` is applied to the `resolveMailTransport` and `mailDelivers` describes to guarantee each case starts from a clean "nothing set" baseline.
