---
source: src/infrastructure/adapters/demo-outbox.ts
sha256: 885257e5c7de9a2d2f5fc43b203684df1af9962ac7a906ec4123fd0dd09c1b42
generated_at: 2026-09-27T14:05:15.224985+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/demo-outbox.ts

## Purpose

In-memory email sink for demo mode. When the process runs under `npm run demo` there is no SMTP server, so the mailer records every send here instead of calling nodemailer. The e2e suite (and the demo router's `GET /__test/emails` endpoint) reads these records to assert on recipients, subjects, tokens, and attachments. The file lives in the infrastructure tier beside the mailer so that the mailer can import it without reaching into the app layer. It is inert unless `enableDemoProfile` (`runtime/demo-profile.ts`) has been called.

## Key elements

- **`DemoOutboxEmail`** (interface) — Shape of one recorded send: `to`, `subject`, `template`, optional `token`, `lines` (rendered primitive variables), optional `attachments` (filenames only, never bytes).
- **`outbox`** (module-level array) — Holds all recorded sends for the lifetime of the process. Newest-first (`unshift`). Not persisted; a restart clears it.
- **`recordDemoEmail(request, templateName, data)`** — Called by the mailer in demo mode. Extracts the token (bare variable first, then `?token=` query param in `linkUrl`), flattens primitive variables into `lines`, and unshifts a `DemoOutboxEmail` onto the array.
- **`readDemoOutbox()`** — Returns a shallow copy (`[...outbox]`) so callers cannot mutate the live array.
- **`clearDemoOutbox()`** — Truncates the array. Intended to be called between e2e specs to prevent email leakage.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports `recordDemoEmail`; in demo mode it calls this function instead of dispatching through nodemailer.
- **`src/app/demo.ts`** — Imports `readDemoOutbox` (and likely `clearDemoOutbox`) to serve the outbox at `GET /__test/emails`.
- **`src/types/index.ts`** — Source of the `EmailJobPayload` type used in `recordDemoEmail`'s signature.
- **`tests/unit/infrastructure/adapters/demo-outbox.test.ts`** — Unit-tests for the token-extraction logic, `lines` flattening, and the record/read/clear cycle.

## Notes

- Token resolution has a fallback order: a top-level `token` template variable wins; otherwise the `?token=` query parameter is parsed out of `linkUrl`. Specs that need the token should rely on this extraction rather than re-parsing the rendered HTML.
- `attachments` stores **filenames only**. The spooled files are discarded on the send path (both inline and worker), so a demo spec can only verify that an attachment was present, not inspect its content.
- `readDemoOutbox` returns a copy, but the objects inside are still the same references. Mutating a field on a returned object *will* corrupt the live outbox.
- The array is module-scoped and process-scoped; it does not survive a restart and is not shared across worker threads.
