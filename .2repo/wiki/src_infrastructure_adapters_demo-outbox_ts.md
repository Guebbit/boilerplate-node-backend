# src/infrastructure/adapters/demo-outbox.ts

## Purpose

In-memory email sink for the demo profile. When `NODE_DEMO=true` and the environment is not production, the mailer records every "send" here instead of calling nodemailer, so the e2e suite can read sent emails (e.g. extract a reset token) without an SMTP server. Lives in the infrastructure tier alongside the mailer because the mailer cannot import from `app`.

## Key elements

- **`DemoOutboxEmail`** — interface describing one recorded send: `to`, `subject`, `template`, optional `token`, and `lines` (stringified primitive template variables).
- **`isDemoMode()`** — gate function. Returns `true` only when `NODE_DEMO` is truthy **and** `NODE_ENV !== 'production'`. Logs at `error` level if the flag is set in production.
- **`recordDemoEmail(request, templateName, data)`** — appends (via `unshift`, so newest-first) a `DemoOutboxEmail` to the module-level array. Extracts `token` from `data.token` if present, otherwise pulls the last hex path segment (≥ 16 chars) from `data.linkUrl`.
- **`readDemoOutbox()`** — returns a shallow copy (`[...outbox]`) so callers cannot mutate the live array.
- **`clearDemoOutbox()`** — empties the array; intended to be called between e2e specs.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — the mailer is the caller of `recordDemoEmail` in demo mode; the outbox's `template` field mirrors `EmailContent.template` defined there.
- **`src/app/demo.ts`** — the demo router that serves the outbox at `GET /__demo/emails` (references `readDemoOutbox`).
- **`src/infrastructure/runtime/environment.ts`** — provides `environmentFlag('NODE_DEMO', …)` used by `isDemoMode`.
- **`src/infrastructure/adapters/logger.ts`** — provides `logger` for the production-guard error message.
- **`tests/unit/infrastructure/adapters/demo-outbox.test.ts`** — unit tests for the recording, reading, clearing, and token-extraction logic.

## Notes

- The outbox is a **module-level array**, not persisted. A process restart silently loses all recorded emails.
- `recordDemoEmail` stores entries **newest-first** (`unshift`), matching inbox reading order.
- `lines` only includes variables whose value is a primitive `string` or `number`; objects, arrays, and `undefined` are excluded.
- Non-string `request.to` (e.g. an address object) is coerced via `JSON.stringify` before storage.
- The token regex expects a hex string of ≥ 16 chars as the **last** path segment of `linkUrl`; if the URL shape changes, token extraction will silently return `undefined`.
- `isDemoMode` is a two-condition gate by design: `NODE_DEMO` alone is never sufficient in production. Do not simplify to a single flag check.
