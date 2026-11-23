---
source: src/infrastructure/adapters/mail-transports.ts
source_sha256: fe948748607e0d1c55e656286711661bb11d63c106c57df4579ae45971378da5
context_sha256: fdc8e842956d253ba750bbfcb0214f996efe64f42f898f2cf715d93f0492465d
generated_at: 2026-11-22T02:39:57.471818+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/mail-transports.ts

## Purpose
The mail transport registry: it decides how an email leaves the process, selected by `NODE_MAIL_TRANSPORT`. Production registers only `smtp`. Pretend transports (`log`, `outbox`) are test doubles that live in `scenarios/support/doubles/` and are registered by the development doubles and by jest. The file is deliberately light: it imports no `nodemailer` or `ejs` at runtime, because jest setup and the development doubles load it before the application.

## Key elements
- `OutgoingMail`: what a transport is handed. It holds the `request` envelope, the `templateName` (outbox name), the translated `data`, and a lazy `render()` that produces the nodemailer `SendMailOptions`. A transport that records name and data never calls `render`, so no render happens.
- `MailTransportAdapter`: the transport contract.
  - `delivers(mail: MailConfig)`: whether mail sent through this transport reaches a real inbox.
  - `send(mail)`: hands off one message and optionally returns a `SentMessageInfo` receipt.
- `smtpTransport` (private): `delivers` is true when `NODE_SMTP_HOST` is set. `send` dynamically imports `./smtp-transport` and calls `sendBySmtp`, so nodemailer loads on first send.
- `DEVELOPMENT_TRANSPORTS`: `['log', 'outbox']`. These are names only, used so a refusal outside `NODE_ENV=development` can explain why `log` is unavailable. A test keeps this list equal to what `registerDoubles` registers.
- `registerMailTransport(name, transport)`: adds or overrides a transport in the registry.
- `resolveMailTransport()`: returns the transport named by `mailConfig().NODE_MAIL_TRANSPORT`, resolved on each send. It throws for an unknown name via `requireProvider`.
- `mailDelivers(mail)`: asks the named transport whether it delivers. It returns `false` for an `undefined` slice or an unknown transport name.
- `mailTransportProbe`: a boot probe, built with `defineProbe('mail-transport', resolveMailTransport)`, that surfaces a bad transport name at boot.

## Relationships
- `./config` supplies `mailConfig` and the `MailConfig` type, which is where `NODE_MAIL_TRANSPORT` and `NODE_SMTP_HOST` come from.
- `@infrastructure/runtime/provider-registry` supplies `createSharedProviderRegistry` and `requireProvider`, which back the registry and the resolver.
- `@infrastructure/config/define` supplies `defineProbe`.
- `./smtp-transport` is lazily imported by the `smtp` transport for the actual send.
- `@types` (`src/types/index.ts`) supplies `EmailJobPayload`, which the `request` field of `OutgoingMail` is typed from.
- `scenarios/support/doubles/register.ts` registers the `log` and `outbox` doubles through `registerMailTransport`. `mail-log.ts` and `mail-outbox.ts` are those doubles' implementations of `MailTransportAdapter`.
- `./mailer` is the sending side that builds `OutgoingMail` and resolves a transport. This is inferred from the neighbor list; the file does not name it.
- `src/modules/account/two-factor/methods/email.ts` asks `mailDelivers` instead of comparing transport names.
- `tests/unit/infrastructure/adapters/mailer-transport.test.ts` tests this behavior.
- `src/app/config.ts` and `src/infrastructure/adapters/config.ts` are config neighbors. The file reads config only through `./config`.

## Notes
- An unknown `NODE_MAIL_TRANSPORT` throws rather than falling back to `smtp`, so a typo cannot turn into mail sent for real. Naming a development double outside `NODE_ENV=development` gets a message explaining that it loads only in development.
- The registry is created with `createSharedProviderRegistry`, so a double registered at boot survives a module reset.
- The probe has no shape of its own. The resolver imports the config, so the config cannot import the resolver without a cycle.
- `delivers` takes the mail slice as an argument because boot checks judge an environment they were handed (`mailConfig.readIn`), not the store's.
