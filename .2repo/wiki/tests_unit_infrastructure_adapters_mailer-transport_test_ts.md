# tests/unit/infrastructure/adapters/mailer-transport.test.ts

## Purpose

Unit tests for the SMTP transport option-building logic in `src/infrastructure/adapters/mailer.ts`. Verifies that the options object handed to `nodemailer.createTransport` correctly maps environment variables to port, TLS mode, credentials, and identity — with emphasis on the `secure`-vs-port pairing, which is a security decision, not a mere setting.

## Key elements

- **`createTransportMock`** – `jest.fn` that replaces `nodemailer.createTransport` so tests can inspect the options object without opening a socket.
- **`transportOptions(environment)`** – Helper that (1) clears the mock, (2) calls `resetTransporter()` to drop the memoised transport, (3) temporarily overrides `process.env`, (4) triggers a send through the exported `nodemailer()` function to force transport construction, (5) restores env, and (6) returns `createTransportMock.mock.calls[0][0]`.
- **`SMTP_ENVIRONMENT`** – Shared base (`NODE_ENV: 'production'`, `NODE_SMTP_HOST`) for all production-branch tests.
- **`describe('the test environment…')`** – Asserts `NODE_ENV=test` yields `{ jsonTransport: true }` (safety net against accidental real mail).
- **`describe('TLS mode follows the port…')`** – Four cases: port 465 → `secure: true`; 587 → `secure: false`; other ports → `secure: false`; unset port → defaults to 587 / `secure: false`.
- **`describe('credentials and identity')`** – Verifies `auth` pass-through, empty-string fallback when credentials are absent (deliberate non-blocking startup), and that unset `NODE_SMTP_NAME` yields `''` rather than the literal string `"undefined"`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** (only dependency) – Imports the exported `nodemailer` send function and `resetTransporter()`. The test does not call the production `createTransport`; it intercepts the `nodemailer` module's `createTransport` via `jest.mock` and inspects the arguments the production module passes in.

## Notes

- **Memoised transport, not module-scope config.** The transport is built lazily on first send and cached. Changing its configuration therefore requires `resetTransporter()` + a send, *not* `jest.resetModules()` + dynamic `import()`. The file's header comment explicitly calls out that the old "re-run module-scope code" dance no longer applies.
- **Env restoration is manual.** `transportOptions` saves/restores `process.env` keys in a try/finally–style pattern (here, sequential restore after the send). There is no `jest.spyOn` on `process.env`.
- **The `secure` invariant is the core assertion.** `secure: true` is *only* correct on 465 (implicit TLS). On 587 the client must start plaintext and upgrade via STARTTLS; getting this backwards either breaks the connection or leaks SMTP credentials in cleartext. The tests exist to pin this one-line decision.
- **`nodemailer()` call parameters are throwaway.** The envelope/template args in the send call are filled with empty strings; only the side-effect of triggering transport construction matters.
