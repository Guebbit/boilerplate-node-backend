---
source: src/infrastructure/adapters/mail-transports.ts
sha256: 400d4129692658c52da806638bdf7944edc0fb786fac2adf6387d79654b39d48
generated_at: 2026-10-14T07:46:30.570355+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mail-transports.ts

## Purpose

Registry and resolution layer for outbound mail transports. It maps the `NODE_MAIL_TRANSPORT` env var to a concrete `MailTransportAdapter` so that callers (2FA, OAuth, boot checks) can ask "does mail sent here reach a real inbox?" (`delivers`) or "hand me this message" (`send`) without naming a transport. Production registers only `smtp`; the `log` and `outbox` test doubles live in `scenarios/support/doubles/` and are injected at runtime.

## Key elements

- **`OutgoingMail`** — the hand-off object a transport receives: envelope request, template name, translated data, and a `render()` that produces `SendMailOptions`. Transports that record rather than send never call `render()`.
- **`MailTransportAdapter`** — the interface every transport satisfies: `delivers(mail: MailConfig) → boolean` and `send(mail: OutgoingMail) → Promise<SentMessageInfo | undefined>`.
- **`smtpTransport`** — the sole production transport. `delivers` checks for `NODE_SMTP_HOST`. `send` lazy-imports `./smtp-transport` on first use so `nodemailer` is never loaded at module-eval time.
- **`mailTransportRegistry`** — a `createSharedProviderRegistry` seeded with `{ smtp }`. Shared across module instances so a double registered during preload or jest setup survives module resets.
- **`registerMailTransport(name, transport)`** — adds or overrides an entry in the registry (used by doubles and tests).
- **`resolveMailTransport()`** — resolves `NODE_MAIL_TRANSPORT` (default `smtp`) via the registry; **throws** on an unknown name rather than silently falling back to SMTP.
- **`mailDelivers(mail)`** — convenience for callers that only need the yes/no: resolves the named transport and delegates to its `delivers`. Returns `false` for an undefined slice or unregistered name.
- **`mailTransportProbe`** — a `defineConfig` probe that calls `resolveMailTransport()` at boot, surfacing typos in `NODE_MAIL_TRANSPORT` before the first in-request send.

## Relationships

- **`./config.ts`** — imports `mailConfig` (the parsed mail slice) and the `MailConfig` type; the probe deliberately does **not** import config to avoid a circular dependency.
- **`./smtp-transport.ts`** — lazily imported inside `smtpTransport.send`; not a static dependency.
- **`@infrastructure/runtime/provider-registry.ts`** — provides `createSharedProviderRegistry` and `requireProvider` underpinning the registry and resolver.
- **`@infrastructure/config/define.ts`** — provides `defineConfig` and `probe` for the boot probe.
- **`@types` (`src/types/index.ts`)** — source of the `EmailJobPayload` type used in `OutgoingMail.request`.
- **`scenarios/support/doubles/mail-log.ts` / `mail-outbox.ts`** — implement `MailTransportAdapter` and register themselves via `registerMailTransport` during dev-preload or jest setup.
- **`scenarios/support/doubles/register.ts`** — the orchestration point that wires the above doubles into the registry before app code runs.
- **`src/modules/account/two-factor/methods/email.ts`** — calls `mailDelivers` to decide whether email-based 2FA is available for a given environment.
- **`src/modules/account/oauth/config.ts`** — consumes the mail config slice; relevant because `delivers` is the gate for OAuth flows that send a confirmation email.
- **`src/infrastructure/adapters/mailer.ts`** — the higher-level mailer that calls `resolveMailTransport()` and then `send()`.
- **`tests/unit/infrastructure/adapters/mailer-transport.test.ts`** — unit-tests resolution, delivery gating, and the throw-on-unknown-name behavior.

## Notes

- **Type-only external deps.** `nodemailer` and `ejs` appear as `import type` only. The file is safe to load in environments where those packages are absent (jest setup, dev preload). The real `nodemailer` load is deferred to the first SMTP `send` call.
- **No fallback on bad name.** `resolveMailTransport` throws rather than defaulting to `smtp`. The `mailTransportProbe` boot check exists specifically to catch a typo before the first in-request send would throw mid-handler.
- **`delivers` takes a `MailConfig` slice, not the global store.** This lets a boot check judge an *arbitrary* environment (`mailConfig.readIn(otherEnv)`) without mutating process state.
- **Registry is shared via `createSharedProviderRegistry`.** A plain `Map` would be lost after a `jest.resetModules()` call; the shared-registry indirection preserves doubles registered at preload time.
