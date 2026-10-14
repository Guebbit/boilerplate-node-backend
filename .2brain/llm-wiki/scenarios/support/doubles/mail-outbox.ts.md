---
source: scenarios/support/doubles/mail-outbox.ts
sha256: 17cc168127ab2f90eb1abf8e9bd358463fcc83bd51b98643f5bff266a9106d02
generated_at: 2026-10-14T07:03:46.040150+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/mail-outbox.ts

## Purpose

An in-memory mail transport used as a test double in demo and e2e scenarios. Instead of dispatching real email, it appends each send to a module-level array that a `GET /__test/emails` endpoint (or a test spec) can read back. It exists so that flows relying on a mailed token (password reset, second-factor code) remain completable without a live SMTP backend.

## Key elements

- **`DemoOutboxEmail`** (interface) — the shape of one recorded send: `to`, `subject`, `template` name, optional `token`, a `lines` array of primitive template variables, and optional `attachments` (filenames only).
- **`outbox`** (module-level `DemoOutboxEmail[]`) — the live store. Newest-first (`unshift`). Lost on process restart; not persisted.
- **`recordDemoEmail(request, templateName, data)`** — normalizes a send into a `DemoOutboxEmail` and prepends it. Extracts a `token` from either a bare template variable or a `#token=` fragment inside `linkUrl`. Filters `data` down to string/number entries for `lines`.
- **`readDemoOutbox()`** — returns a shallow copy of the array so callers cannot mutate live state.
- **`clearDemoOutbox()`** — empties the array; called between e2e specs to prevent leakage.
- **`outboxMailTransport`** (object, `MailTransportAdapter`) — the adapter surface. `delivers()` always returns `true`; `send()` delegates to `recordDemoEmail` and resolves immediately.

## Relationships

- **`src/infrastructure/adapters/mail-transports.ts`** — defines the `MailTransportAdapter` interface that `outboxMailTransport` implements.
- **`src/types/index.ts`** — source of the `EmailJobPayload` type used in the `recordDemoEmail` signature.
- **`scenarios/support/doubles/register.ts`** — imports and registers this transport so the mailer resolves to it in demo/test mode.
- **`scenarios/support/demo.ts`** — the demo harness that exposes the recorded emails (e.g. via `GET /__test/emails`) to a browser or spec runner.
- **`tests/unit/scenarios/mail-outbox.test.ts`** — unit tests for the record / read / clear / token-extraction logic in this file.
- **`tests/unit/infrastructure/adapters/mailer-transport.test.ts`** — exercises the mailer's transport dispatch path, which this adapter participates in.

## Notes

- `delivers()` hard-codes `true`. The comment frames this as "a second factor that mails a code is available when a person can read the mail." Do not change it to `false` without reworking the second-factor flow in scenarios.
- Token extraction checks the bare `token` variable first, then falls back to a `#token=` hash fragment in `linkUrl`. If a template carries both, the bare variable wins.
- `lines` intentionally excludes non-primitive values (objects, arrays, booleans). A spec that needs structured data should read the original template variables, not `lines`.
- Attachments are recorded by filename only; the spooled file bytes are discarded by the mailer after `send` resolves, matching production behavior. No byte-level assertion is possible.
- The outbox is per-process and in-memory. A test runner that forks workers will see an empty outbox in sibling workers.
