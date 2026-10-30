---
source: src/infrastructure/adapters/mail-transports.ts
sha256: 63879c4147d3e3b66dba2a64391c3bd25a74a96397f113e2a7a3a15331ce1bf2
generated_at: 2026-10-29T01:56:05.040506+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mail-transports.ts

## Purpose

The mail transport registry: maps the `NODE_MAIL_TRANSPORT` env var to a concrete `MailTransportAdapter` that can send (or pretend to send) one message. It exists so callers ask *"does this reach an inbox?"* (`delivers`) or *"hand this off"* (`send`) without naming a specific backend. Only `smtp` is registered in production; `log` and `outbox` are test doubles registered at preload/Jest time.

## Key elements

- **`OutgoingMail`** — the payload a transport receives: the original request, template name, translated data, and a deferred `render()` that produces `SendMailOptions`. Recording transports skip `render` entirely.
- **`MailTransportAdapter`** — the contract every transport fulfils: `delivers(mail)` (boolean, does it reach a real inbox?) and `send(mail)` (returns `SentMessageInfo | undefined`).
- **`smtpTransport`** — the sole production adapter. `delivers` checks for `NODE_SMTP_HOST`; `send` lazy-imports `./smtp-transport` so `nodemailer` is never loaded until the first email is actually sent.
- **`mailTransportRegistry`** — a `createSharedProviderRegistry` instance seeded with `{ smtp: smtpTransport }`. "Shared" means a double registered before the app boots survives Jest module resets.
- **`registerMailTransport(name, transport)`** — adds or overrides a transport without editing this file. Used by the dev preload and Jest setup to inject `log` / `outbox`.
- **`resolveMailTransport()`** — looks up the transport named by `NODE_MAIL_TRANSPORT` (defaults to `smtp`). Throws on an unknown name so a typo does not silently fall back to real SMTP.
- **`mailDelivers(mail)`** — safe boolean: resolves the named transport and asks `delivers`; returns `false` for an unknown name or unparsed config. Called by boot checks (e.g. two-factor email, password-less account step-up).
- **`mailTransportProbe`** — a `defineProbe` wrapping `resolveMailTransport`; fails at boot if the transport name is unregistered, rather than mid-request.

## Relationships

- **`./config`** (`src/infrastructure/adapters/config.ts`) — provides `mailConfig()` / `MailConfig`, the parsed env slice that both `delivers` and `resolveMailTransport` read.
- **`./smtp-transport`** (`src/infrastructure/adapters/smtp-transport.ts`) — the actual SMTP sender; dynamically imported on first `send` to keep `nodemailer` out of the preload path.
- **`@infrastructure/runtime/provider-registry`** — supplies `createSharedProviderRegistry` and `requireProvider`, the lookup + shared-state mechanism.
- **`@infrastructure/config/define`** — supplies `defineProbe`, used to turn `resolveMailTransport` into a boot-time gate.
- **`scenarios/support/doubles/mail-log.ts` / `mail-outbox.ts` / `register.ts`** — test doubles that implement `MailTransportAdapter` and are injected via `registerMailTransport` before the app loads.
- **`src/modules/account/two-factor/methods/email.ts`** — calls `mailDelivers` (or `delivers` directly) to decide whether to offer the email 2FA method.
- **`src/modules/account/oauth/config.ts`** — boot check that depends on `mailDelivers` for accounts without a password.
- **`src/types/index.ts`** — source of the `EmailJobPayload` type used in `OutgoingMail.request`.
- **`src/app/config.ts`** — where `NODE_MAIL_TRANSPORT` is validated at the application level.
- **`tests/unit/infrastructure/adapters/mailer-transport.test.ts`** — unit tests exercising the registry, resolution, and delivery semantics.

## Notes

- **Lazy `smtp` import is deliberate.** The Jest setup and dev preload load this file before the application; eagerly importing `nodemailer`/`ejs` here would pull heavy dependencies into every test process. The `render` callback in `OutgoingMail` is the same pattern: recording transports never call it, so the template is never rendered.
- **`delivers` takes a `MailConfig` slice, not "the current env."** This lets a boot check pass a slice it already parsed (e.g. `mailConfig.readIn(env)`) without a second env read, and lets test doubles answer truthfully regardless of the host's variables.
- **Unknown transport names never fall back to `smtp`.** `resolveMailTransport` throws; `mailDelivers` returns `false`. A typo in `NODE_MAIL_TRANSPORT` should fail loudly, not send real mail.
- **The registry is shared across module instances** (`createSharedProviderRegistry`). A double registered at preload time is still visible after Jest resets the module registry within a test file.
