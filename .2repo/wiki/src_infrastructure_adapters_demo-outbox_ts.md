# src/infrastructure/adapters/demo-outbox.ts

## Purpose

In-memory email sink for demo mode. Under `npm run demo` there is no SMTP server, yet the e2e suite must still read the emails the app "sent" (a password-reset token, for example). The mailer records each send here instead of calling nodemailer, and the demo router exposes the results over HTTP. The module is inert unless `NODE_DEMO=true`.

## Key elements

- **`DemoOutboxEmail`** (interface) — Shape of one recorded send: `to`, `subject`, `template`, optional `token`, and `lines` (stringified primitive template variables).
- **`isDemoMode()`** — Returns `true` when the `NODE_DEMO` environment flag is set; delegates to `environmentFlag`.
- **`recordDemoEmail(request, templateName, data)`** — Appends (actually prepends) a `DemoOutboxEmail` to the internal array. Lifts the token from `data.token` or, failing that, from the last path segment of `data.linkUrl` (16+ hex chars).
- **`readDemoOutbox()`** — Returns a shallow copy of all recorded emails, newest first.
- **`clearDemoOutbox()`** — Empties the internal array; called between e2e specs to prevent leakage.
- **`outbox`** (module-level `const`, not exported) — The backing array. Cleared on process restart.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — The mailer imports `isDemoMode` and, when true, calls `recordDemoEmail` in place of a nodemailer send. This file lives beside the mailer at the infrastructure tier so the mailer never reaches into the app layer.
- **`src/app/demo.ts`** — The demo router imports `readDemoOutbox` and serves the result at `GET /__demo/emails` for the e2e suite.
- **`src/infrastructure/runtime/environment.ts`** — Provides `environmentFlag`, which `isDemoMode` uses to read `NODE_DEMO`.
- **`src/app.ts`** — Application entry point that wires the demo router (and therefore this module) into the running app.
- **`tests/unit/infrastructure/adapters/demo-outbox.test.ts`** — Unit tests covering recording, token extraction, read/clear semantics, and edge cases (non-string `to`, missing `linkUrl`, etc.).

## Notes

- **Newest-first ordering.** `recordDemoEmail` uses `unshift`, so `readDemoOutbox` returns the most recent email at index 0, matching inbox reading order.
- **Token fallback logic.** The primary source is `data.token`; the secondary source is a regex (`/\/([\da-f]{16,})$/`) against `data.linkUrl`. If neither yields a token, the field is `undefined`.
- **`lines` is lossy by design.** Only `string` and `number` template variables are included; objects, arrays, and booleans are filtered out.
- **Non-string `to` is JSON-stringified**, not `String()`-coerced, preserving the shape of array/recipient objects.
- **Not persisted.** The outbox is a plain module-level array; a process restart or `clearDemoOutbox` call wipes it. There is no disk or DB backing.
