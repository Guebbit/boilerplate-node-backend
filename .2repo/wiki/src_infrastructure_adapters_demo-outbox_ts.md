# src/infrastructure/adapters/demo-outbox.ts

## Purpose

An in-memory email outbox that captures sends during `npm run demo` (when no SMTP server or broker is available). The mailer adapter records emails here instead of calling nodemailer, and the demo router serves the accumulated list to the e2e suite so specs can assert on password-reset tokens and rendered content. It is infrastructure-tier by design so the mailer adapter never reaches up into `app`. Inert unless `NODE_DEMO=true`.

## Key elements

- **`DemoOutboxEmail`** (interface) — Shape of one recorded send: `to`, `subject`, `template`, optional `token`, and `lines` (stringified primitive template variables).
- **`isDemoMode()`** — Returns `true` when the `NODE_DEMO` environment flag is set; delegates to `environmentFlag`.
- **`outbox`** (module-private array) — Holds recorded emails, newest first (via `unshift`).
- **`recordDemoEmail(request, templateName, data)`** — Called by the mailer in demo mode. Extracts the reset/verify token from either a bare `token` variable or the last path segment of `linkUrl`, then unshifts a `DemoOutboxEmail` onto the outbox.
- **`readDemoOutbox()`** — Returns a shallow copy of the outbox (read-only snapshot for the router).
- **`clearDemoOutbox()`** — Empties the outbox (used between test cases).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — In demo mode the mailer calls `recordDemoEmail` in place of the nodemailer send, and checks `isDemoMode` to decide which path to take.
- **`src/app/demo.ts`** — The demo router calls `readDemoOutbox` (and likely `clearDemoOutbox`) to serve `GET /__demo/emails` to the e2e suite.
- **`src/infrastructure/runtime/environment.ts`** — Provides `environmentFlag`, which `isDemoMode` wraps.
- **`tests/unit/infrastructure/adapters/demo-outbox.test.ts`** — Unit-tests `recordDemoEmail`, `readDemoOutbox`, `clearDemoOutbox`, and the token-extraction logic.

## Notes

- **Token extraction is two-step:** a bare `token` template variable wins; otherwise the code regex-extracts a trailing hex string (≥ 16 chars) from `linkUrl`. This mirrors the reset/verify templates that embed the token in a link path rather than exposing it as a standalone variable.
- **`lines` only includes primitives:** template variables that are objects or arrays are silently excluded from the `lines` array, so specs asserting on them must use `token` or the raw template data.
- **Module-level mutable state:** the `outbox` array is a singleton; there is no per-request or per-process isolation. Tests should call `clearDemoOutbox` in teardown.
- **`request.to` may be an array or object** (nodemailer's `SendMailOptions`); the code falls back to `JSON.stringify` for non-string values, which may not be what a spec expects.
