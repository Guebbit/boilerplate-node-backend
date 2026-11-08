---
source: src/infrastructure/adapters/mail-transports.ts
sha256: 6b918ce33beda579784ae818c2824a0d049fc61b3a2e3c4155bd3058ff2ab9b3
generated_at: 2026-11-08T03:21:23.156780+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mail-transports.ts

## Purpose

Registry that maps the `NODE_MAIL_TRANSPORT` env var to a concrete sender. Production ships only `smtp`; test doubles (`log`, `outbox`) are registered at preload or jest-setup time. The file is intentionally dependency-light (no `nodemailer`, no `ejs` at module scope) so it can load before the application boots, with the real sender deferred to first send.

## Key elements

- **`OutgoingMail`** — interface describing one outgoing message: raw request, template name, translated data, and a `render()` closure that produces a full `SendMailOptions`. Recording transports never call `render()`.
- **`MailTransportAdapter`** — the transport contract. `delivers(mail: MailConfig) → boolean` answers "does this reach a real inbox?"; `send(mail: OutgoingMail) → Promise<SentMessageInfo | undefined>` dispatches.
- **`smtpTransport`** — the sole production adapter. `delivers` checks `NODE_SMTP_HOST`; `send` lazy-imports `./smtp-transport` and calls `sendBySmtp`.
- **`mailTransportRegistry`** — a `createSharedProviderRegistry` instance seeded with `{ smtp: smtpTransport }`. Shared across module instances so a double registered before a jest module reset still resolves.
- **`registerMailTransport(name, transport)`** — adds or overrides a transport by name without editing this file.
- **`resolveMailTransport()`** — resolves the active adapter from `NODE_MAIL_TRANSPORT` (defaults to `smtp`). Throws on an unknown name rather than silently falling back.
- **`mailDelivers(mail)`** — asks the named transport whether it reaches a real inbox; returns `false` for unknown names or unparsed slices.
- **`mailTransportProbe`** — a `defineProbe` wrapper around `resolveMailTransport` so a typo in the env var is caught at boot instead of mid-request.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — provides `mailConfig` and the `MailConfig` type used throughout.
- **`src/infrastructure/adapters/smtp-transport.ts`** — lazy-imported inside `smtpTransport.send`; not loaded until first message.
- **`src/infrastructure/runtime/provider-registry.ts`** — supplies `createSharedProviderRegistry` and `requireProvider` used to build and query the registry.
- **`src/infrastructure/config/define.ts`** — provides `defineProbe`, used to declare `mailTransportProbe`.
- **`src/types/index.ts`** — source of the `EmailJobPayload` type in `OutgoingMail.request`.
- **`scenarios/support/doubles/mail-log.ts` / `mail-outbox.ts` / `register.ts`** — test doubles that call `registerMailTransport` during dev-preload or jest setup.
- **`src/modules/account/two-factor/methods/email.ts`** — consumes `mailDelivers` (or the adapter's `delivers`) to decide whether a mail-based 2FA code actually reaches the user, rather than string-matching the transport name.
- **`tests/unit/infrastructure/adapters/mailer-transport.test.ts`** — unit-tests the registry, resolution, and `delivers` logic.

## Notes

- The module deliberately avoids top-level imports of `nodemailer` and `ejs` (only their *types*). Both the jest setup and the dev preload load this file before the app; adding a heavy import here would slow or break that load order.
- `smtpTransport.send` uses a dynamic `import('./smtp-transport')` so the sender (and its transitive `nodemailer` dependency) is loaded only on first send, not at registry construction.
- `resolveMailTransport` throws on an unknown `NODE_MAIL_TRANSPORT` value. The comment warns that falling back to `smtp` would turn a typo into real mail delivery.
- The registry is created via `createSharedProviderRegistry` specifically so a double registered in one module instance (e.g., a preload script) is visible after `jest.resetModules()` reloads the app under test.
