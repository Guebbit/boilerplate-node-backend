---
source: scenarios/support/doubles/mail-outbox.ts
sha256: b46381fe5005bc2cd14a42b40d6cbbdb1b7986acaa543920a2d2850e0b7c999e
generated_at: 2026-10-29T01:26:34.132750+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/mail-outbox.ts

## Purpose

In-memory test double for the mail transport. Instead of dispatching emails, it records every send into a module-level array so that demo-mode users (via `GET /__test/emails`) and test suites can inspect what "would have been" sent. It is never shipped to production.

## Key elements

- **`DemoOutboxEmail`** — interface describing one recorded send: recipient, subject, template name, extracted `token`, `locale`, primitive template variables as `lines`, and attachment filenames (bytes discarded).
- **`outbox`** (module-level `DemoOutboxEmail[]`) — the live store. Not persisted; a process restart clears it.
- **`recordDemoEmail(request, templateName, data)`** — pushes a normalized record to the front of the array. Lifts the token out of a `#token=` URL fragment when it is not a bare template variable.
- **`readDemoOutbox()`** — returns a shallow copy of the array so callers cannot mutate the live outbox.
- **`clearDemoOutbox()`** — empties the array; called between e2e specs to prevent leakage.
- **`outboxMailTransport`** — the `MailTransportAdapter` implementation. `delivers()` always returns `true`; `send()` delegates to `recordDemoEmail` and resolves immediately.

## Relationships

- **`src/infrastructure/adapters/mail-transports.ts`** — provides the `MailTransportAdapter` type that `outboxMailTransport` implements.
- **`src/types/index.ts`** — source of the `EmailJobPayload` type used in `recordDemoEmail`'s signature.
- **`scenarios/support/doubles/register.ts`** — registers `outboxMailTransport` as the active transport in demo/test mode.
- **`scenarios/support/demo.ts`** — exposes the `GET /__test/emails` endpoint that reads back from this outbox.
- **`tests/support/journey-mail.ts`** — e2e helper that reads and asserts against recorded emails.
- **`tests/unit/scenarios/mail-outbox.test.ts`** — unit tests covering recording, token extraction, locale capture, and clearing.
- **`tests/unit/infrastructure/adapters/mailer-transport.test.ts`** — tests the real mailer adapter; this module's interface contract is the reference it tests against.

## Notes

- The outbox is **newest-first** (`unshift`), matching inbox reading order.
- `lines` contains only primitive (string/number) template variables rendered as `key: value` pairs — objects, arrays, and nested structures are excluded.
- Attachments are recorded as **filenames only**; the send path (both inline and worker) discards spooled file bytes after recording, mirroring real-send behavior.
- `delivers()` returning `true` is intentional: it signals to the application that a mail-based second factor (e.g., a verification code) is "available" to the recipient, since a human can actually read the outbox.
- Token extraction handles two shapes: a bare `data.token` string, or a `#token=<value>` fragment inside `data.linkUrl` (URL-decoded).
