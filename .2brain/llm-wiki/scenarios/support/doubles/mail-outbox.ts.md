---
source: scenarios/support/doubles/mail-outbox.ts
source_sha256: 6665e8ef924358d65bf0593059bdab66216467ed0a3e54d53ba9fcb1c4b35e0f
context_sha256: 6b6e7aae994f74b719a08ef03bd59f7b19c83db2eaa8213754522c988068c150
generated_at: 2026-11-22T01:47:17.822585+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/doubles/mail-outbox.ts

## Purpose
A test-only `outbox` mail transport. Instead of sending email, it records each send in an in-memory list. The demo's `GET /__test/emails` endpoint and tests can read that list back, for example to extract a password-reset token. It is never shipped.

## Key elements
- `DemoOutboxEmail`: the shape of one recorded send, with these fields:
  - `to`
  - `subject`
  - `template`: the template name, not rendered HTML.
  - `token?`
  - `locale?`
  - `lines`: `key: value` strings for each string or number template variable.
  - `attachments?`: filenames only, never the bytes.
- `recordDemoEmail(request, templateName, data)`: builds a `DemoOutboxEmail` and puts it at the front of the outbox (newest first).
  - `token` comes from `data.token`, or else from the `#token=` fragment of `data.linkUrl` (URL-decoded).
  - `locale` comes from `data.locale`.
- `readDemoOutbox()`: returns a copy of the outbox, so callers cannot mutate the live list.
- `clearDemoOutbox()`: empties the outbox, intended to run between e2e specs.
- `outboxMailTransport`: the `MailTransportAdapter` implementation.
  - `delivers()` always returns `true`.
  - `send()` calls `recordDemoEmail` and resolves with `undefined`.

## Relationships
- Implements `MailTransportAdapter` from `src/infrastructure/adapters/mail-transports.ts`.
- Takes `EmailJobPayload` from `src/types/index.ts` for the request type.
- `scenarios/support/doubles/register.ts` registers it as the `outbox` transport.
- Presumably, `scenarios/support/demo.ts` and `tests/support/journey-mail.ts` read the outbox through `readDemoOutbox` and `clearDemoOutbox`. The file's own docs name the demo's `/__test/emails` reader but not these files specifically.
- Covered by `tests/unit/scenarios/mail-outbox.test.ts` and `tests/unit/infrastructure/adapters/mailer-transport.test.ts`.

## Notes
- The outbox is module-level state and is not persisted. A process restart clears it.
- Nothing is rendered. The suite asserts on the template name and data, never on HTML.
- `delivers: true` is deliberate: a second factor that mails a code counts as available because a person can read the mail in the outbox.
- A non-string `to` is stringified before recording.
- Attachment bytes are not kept. The send path discards the spooled files after sending, so the filenames are the only trace left.
