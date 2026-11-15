---
source: scenarios/support/doubles/mail-outbox.ts
sha256: ef2b0376fb7db596c774b4c0aa5e2eacbe3a201572a0759727a9130d2ba35688
generated_at: 2026-11-14T17:17:21.602802+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/mail-outbox.ts

## Purpose

A test double that replaces real email delivery in demo and test contexts. Instead of dispatching a message, it records every send in a module-level in-memory array so that the demo's `GET /__test/emails` endpoint or a test spec can inspect what "would have" been sent. It implements the `MailTransportAdapter` contract and is registered via `./register`.

## Key elements

- **`DemoOutboxEmail`** — Interface describing one recorded send: `to`, `subject`, `template` (the template name, not rendered HTML), optional `token`, optional `locale`, `lines` (primitive template variables as `key: value` strings), and optional `attachments` (filenames only, never bytes).
- **`outbox`** — Module-level `DemoOutboxEmail[]`; not persisted, so a process restart clears it.
- **`recordDemoEmail(request, templateName, data)`** — Appends (actually `unshift`s, so newest-first) one entry. Extracts the token either from a bare `data.token` variable or from a `#token=` fragment in `data.linkUrl`. Filters `lines` to string/number values only.
- **`readDemoOutbox()`** — Returns a shallow copy of the array so callers cannot mutate the live outbox.
- **`clearDemoOutbox()`** — Empties the array; called between e2e specs to prevent leakage.
- **`outboxMailTransport`** — The `MailTransportAdapter` object: `delivers` always resolves `true`; `send` calls `recordDemoEmail` and resolves `undefined` (no network I/O).

## Relationships

- **`src/infrastructure/adapters/mail-transports.ts`** — Provides the `MailTransportAdapter` interface that `outboxMailTransport` satisfies.
- **`src/types/index.ts`** — Provides the `EmailJobPayload` type used to shape the `request` parameter in `recordDemoEmail`.
- **`scenarios/support/doubles/register.ts`** — Wires `outboxMailTransport` into the demo's dependency graph in place of a real transport.
- **`scenarios/support/demo.ts`** — Exposes the recorded outbox over `GET /__test/emails`, calling `readDemoOutbox`.
- **`tests/unit/scenarios/mail-outbox.test.ts`** — Unit-tests the recording, token extraction, and clear logic in isolation.
- **`tests/support/journey-mail.ts`** — Journey-level helper that reads `readDemoOutbox` to assert on sent mail during e2e flows.
- **`tests/unit/infrastructure/adapters/mailer-transport.test.ts`** — Exercises the mailer pipeline with this transport as the adapter under test.

## Notes

- The outbox records the template **name** and raw variables; it never renders HTML. Specs assert on `template` and `lines`, not on markup.
- `token` extraction handles two shapes: a top-level `data.token` string, or a `#token=` fragment embedded in `data.linkUrl` (URL-decoded). The bare variable wins if both are present.
- `lines` intentionally excludes objects, arrays, and booleans—only `string` and `number` values appear. Specs needing complex data must read the raw `data` elsewhere.
- `attachments` stores only filenames. The actual spooled files are discarded on the send path (matching real-send behavior), so this is the sole trace available to a demo-mode spec.
- `delivers` unconditionally returns `true`: the contract is "the mail can be read back," not "the mail left the building."
