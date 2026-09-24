---
source: src/infrastructure/adapters/demo-outbox.ts
sha256: 8d4416f4a6ccd4d4860118dcd14a917361f6046f6f597112f4cdea38ef59ba5e
generated_at: 2026-09-23T17:38:32.620058+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/demo-outbox.ts

## Purpose

In-memory email sink for demo mode. When `npm run demo` runs without an SMTP server, the mailer records every send here instead of dispatching via nodemailer. The e2e suite (especially password-reset specs) reads the recorded token and content through the demo router's `GET /__test/emails` endpoint. The file lives in `infrastructure/adapters` alongside the mailer because the mailer cannot reach up into `app/`.

## Key elements

- **`DemoOutboxEmail`** (interface) — Shape of one recorded send: `to`, `subject`, `template` name, optional `token`, `lines` (primitive template vars as `"key: value"` strings), and optional `attachments` (filenames only, never bytes).
- **`outbox`** (module-level `const` array) — The sole state. Newest-first; cleared on process restart.
- **`recordDemoEmail(request, templateName, data)`** — Appends (unshifts) a new `DemoOutboxEmail`. Extracts the token either from a bare `data.token` variable or from a `?token=` query parameter in `data.linkUrl`. Records only primitive (string/number) template variables in `lines`.
- **`readDemoOutbox()`** — Returns a shallow copy of the array so callers cannot mutate the live outbox.
- **`clearDemoOutbox()`** — Empties the array; intended to be called between e2e specs to prevent cross-test leakage.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — In demo mode the mailer calls `recordDemoEmail` in place of `nodemailer.send`. The mailer also discards spooled attachment files after recording, making the outbox's `attachments` list the only trace.
- **`src/app/demo.ts`** — The demo router calls `readDemoOutbox()` (and likely `clearDemoOutbox()`) to serve and reset the sink at `GET /__test/emails`.
- **`src/types/index.ts`** — Provides the `EmailJobPayload` type that `recordDemoEmail` destructures for its `request` parameter.
- **`tests/unit/infrastructure/adapters/demo-outbox.test.ts`** — Unit tests exercising token extraction, `lines` filtering, ordering, and the read/clear round-trip.

## Notes

- **Inert by default.** This module only records; the decision of whether the process is in demo mode lives in `runtime/demo-profile.ts` (`enableDemoProfile`). Nothing in this file checks or flips that flag.
- **Token extraction is two-path.** Reset/verify templates carry the token inside a `linkUrl` query string rather than as a top-level variable. The regex `/[&?]token=([^&]+)/` handles both `?token=` and `&token=`; the value is `decodeURIComponent`-decoded before storage.
- **`lines` is lossy by design.** Only `string` and `number` template variables are captured. Objects, arrays, and functions are silently dropped — specs that need richer content must assert against `template` + `token` instead.
- **State is process-local.** No persistence, no IPC. A server restart silently wipes all recorded emails.
