---
source: scenarios/support/doubles/register.ts
sha256: 1482527d477735104e52fca9caa1e38727f2188c5972739aedb06e6d9d446812
generated_at: 2026-10-14T07:04:57.642494+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/register.ts

## Purpose

Single entry point that populates the application's registries with test/dev doubles (mail, payments, webhooks). It exists so that both the dev preload script and the Jest test harness can install every fake with one call, and so that production code (inside `src/`) never accidentally pulls these doubles in.

## Key elements

- **`registerDoubles(): void`** — the only export. Calls `registerPaymentDouble()`, registers two mail transports (`'log'` and `'outbox'`) via `registerMailTransport`, and calls `registerWebhookSinkExemption()`. Idempotent: a second call replaces existing registry entries rather than duplicating them.

## Relationships

- **`scenarios/support/development-doubles.ts`** — caller; invokes `registerDoubles` before the application loads in dev/demo mode.
- **`tests/support/setup.ts`** — caller; invokes `registerDoubles` once per test file via Jest setup.
- **`src/infrastructure/adapters/mail-transports.ts`** — provides `registerMailTransport`, the registry this file writes mail doubles into.
- **`scenarios/support/doubles/mail-log.ts`** — supplies the `logMailTransport` double (lazily loads `nodemailer` on first send).
- **`scenarios/support/doubles/mail-outbox.ts`** — supplies the `outboxMailTransport` double.
- **`scenarios/support/doubles/payments/register.ts`** — supplies `registerPaymentDouble`.
- **`scenarios/support/doubles/webhook-sink.ts`** — supplies `registerWebhookSinkExemption`.

## Notes

- **Import-time lightness is a hard requirement.** Both callers execute *before* OpenTelemetry patches and *before* Jest hoists `jest.mock`. Any double that eagerly imports a heavy module (e.g. the payments adapter) at module-load time would break both callers. Doubles that need such modules must defer the import to their first invocation.
- The file lives outside `src/` by design; production code paths have no way to import it.
- `mail-transports.ts` is imported here, but it does **not** import `nodemailer` at its top level — the log double loads the real transport on its first `send`, keeping this registration file side-effect-free.
