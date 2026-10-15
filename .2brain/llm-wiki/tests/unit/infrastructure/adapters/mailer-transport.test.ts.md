---
source: tests/unit/infrastructure/adapters/mailer-transport.test.ts
sha256: 1892da181796aed351e90cdb5f75f4f70dd96e8e66d9a873a54713bcbba22668
generated_at: 2026-10-15T13:08:19.753428+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-transport.test.ts

## Purpose

Unit tests for the nodemailer transport configuration (options passed to `createTransport`), the `resolveMailTransport` selection logic, and the `mailDelivers` reachability check. The suite verifies security-critical settings (TLS mode, file/URL access lockdown, credential defaults) and transport-name resolution without opening a real socket.

## Key elements

- **`createTransportMock`** – `jest.fn` that captures the options object handed to nodemailer's `createTransport`, returning a stub with a `sendMail` fn.
- **`jest.mock('nodemailer', …)`** – Module-level mock so no socket is ever opened; the mock delegates to `createTransportMock`.
- **`transportOptions(env)`** – Helper that clears the mock, calls `resetTransporter()`, sets the given environment, triggers one `sendTemplatedEmail` (catching errors), and returns the captured options.
- **`SMTP_ENVIRONMENT`** – Constant `{ NODE_MAIL_TRANSPORT: 'smtp', NODE_SMTP_HOST: 'smtp.example.com' }` reused across SMTP-focused cases.
- **`describe('the test environment uses a transport that sends nothing')`** – Asserts the `log` double uses `jsonTransport: true` with file/URL access disabled.
- **`describe('message data can never read a file or fetch a URL')`** – Asserts `disableFileAccess` / `disableUrlAccess` are always `true` on the SMTP branch.
- **`describe('TLS mode follows the port…')`** – Verifies `secure: true` only on 465, `secure: false` on 587/25, `requireTLS: true` on 587, and the 587-with-`secure:false` default when no port is set.
- **`describe('credentials and identity')`** – Checks `auth` pass-through, empty-string fallback for unset credentials, and `name` defaulting to `''`.
- **`describe('resolveMailTransport')`** – Verifies default-to-smtp, explicit `log`/`outbox` selection, and that an unrecognised name throws rather than silently falling back.
- **`describe('mailDelivers')`** – Table-driven check of when a transport is considered "reaching a person" (smtp+host → true; log → false; outbox → true; unknown → false; blank host → false; unparsed slice → false).

## Relationships

| Neighbor | Interaction |
|----------|-------------|
| `src/infrastructure/adapters/mailer.ts` | Calls `sendTemplatedEmail` to force transport construction and capture options. |
| `src/infrastructure/adapters/smtp-transport.ts` | Calls `resetTransporter` to clear the memoised transport before each scenario. |
| `src/infrastructure/adapters/mail-transports.ts` | Imports and tests `resolveMailTransport` and `mailDelivers`. |
| `src/infrastructure/adapters/config.ts` | Imports `mailConfig` and feeds its `.readIn(…)` / `()` results into `mailDelivers`. |
| `scenarios/support/doubles/mail-log.ts` | Imports `logMailTransport` to assert identity in the `resolveMailTransport` test. |
| `scenarios/support/doubles/mail-outbox.ts` | Imports `outboxMailTransport` (same pattern). |
| `tests/support/environment.ts` | Imports `setEnvironment` and `withoutEnvironmentInThisFile` for env isolation between cases. |

## Notes

- **Memoised transport:** The transport is built once and cached. The correct reset pattern is `resetTransporter()` + one send, *not* `jest.resetModules()` + dynamic `import()`. There is no remaining module-scope code that would need re-execution.
- **`secure` is a security decision, not a convenience flag:** `true` on 587 breaks the connection; `false` on 465 leaks SMTP AUTH over plaintext. The tests lock in the correct pairing.
- **Defaults are intentionally safe:** no port → 587 (submission + STARTTLS); no credentials → `''` not `undefined` (avoids the literal string `"undefined"` on the wire); no EHLO name → `''`.
- **The suite's default transport is the `log` double** (via `tests/support/setup-environment.ts`), so a stray test cannot email a real person. The `smtp` branch is exercised only by explicitly naming it in the env.
- **`mailDelivers(undefined)` returns `false`** – a guard for callers that receive an unparseable config slice.
