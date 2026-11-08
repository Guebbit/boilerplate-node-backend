---
source: scenarios/support/doubles/mail-outbox.ts
sha256: b46381fe5005bc2cd14a42b40d6cbbdb1b7986acaa543920a2d2850e0b7c999e
generated_at: 2026-11-08T02:33:36.307384+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/mail-outbox.ts

## Purpose

A test-double mail transport that records every email in a module-level in-memory array instead of sending it. It exists so that demo mode (`GET /__test/emails`) and test suites can inspect what would have been mailed (recipient, template name, token, locale, attachments) without requiring a real SMTP or API backend.

## Key elements

- **`DemoOutboxEmail`** — interface describing one recorded send: `to`, `subject`, `template` (template *name*, not rendered HTML), optional `token`, optional `locale`, `lines` (primitive template variables as `"key: value"` strings), optional `attachments` (filenames only).
- **`outbox`** — module-level `DemoOutboxEmail[]`; not persisted, cleared on process restart.
- **`recordDemoEmail(request, templateName, data)`** — appends (unshifts, newest-first) a `DemoOutboxEmail` to the array. Extracts the token either from a bare `data.token` variable or from a `#token=` fragment in `data.linkUrl`. Collects all string/number template variables into `lines`. Pulls attachment filenames from the request.
- **`readDemoOutbox()`** — returns a shallow copy of the array so callers cannot mutate live state.
- **`clearDemoOutbox()`** — empties the array; called between e2e specs to prevent cross-test leakage.
- **`outboxMailTransport`** — the `MailTransportAdapter` object: `delivers()` always returns `true` (so second-factor flows that gate on "mail is deliverable" proceed); `send()` delegates to `recordDemoEmail` and resolves immediately.

## Relationships

- **`scenarios/support/doubles/register.ts`** — registers `outboxMailTransport` as the active transport when demo/test mode is bootstrapped.
- **`src/infrastructure/adapters/mail-transports.ts`** — provides the `MailTransportAdapter` interface that `outboxMailTransport` implements.
- **`src/types/index.ts`** — supplies the `EmailJobPayload` type used in `recordDemoEmail`'s parameter signature.
- **`scenarios/support/demo.ts`** — the demo server that exposes the `GET /__test/emails` endpoint reading from this outbox.
- **`tests/support/journey-mail.ts`** — e2e helper that calls `readDemoOutbox` / `clearDemoOutbox` to assert on sent mail.
- **`tests/unit/scenarios/mail-outbox.test.ts`** — unit tests exercising token extraction, locale recording, attachment capture, and the `delivers` contract.
- **`tests/unit/infrastructure/adapters/mailer-transport.test.ts`** — verifies the mailer transport layer works correctly when wired to this outbox adapter.

## Notes

- The outbox asserts on **template name + data variables**, never on rendered HTML — do not expect to find EJS output here.
- `delivers` is hardcoded to `true`; this is intentional so that 2FA / password-reset flows that conditionally enable a "mail a code" path remain active in demo mode.
- Token extraction is dual-path: first checks `data.token` as a plain string, then falls back to parsing `data.linkUrl` for a `#token=` fragment (URL-decoded). If both are absent, `token` is `undefined`.
- `lines` only captures primitives (string | number); object/array template variables are silently omitted.
- The array is **not** shared across processes (e.g., a separate email worker would have its own empty outbox) and is **not** persisted across restarts.
