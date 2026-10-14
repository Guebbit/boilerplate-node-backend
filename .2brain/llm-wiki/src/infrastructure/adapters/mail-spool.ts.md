---
source: src/infrastructure/adapters/mail-spool.ts
sha256: f143524995d8de15e8f5e312fbeb13efecf0b125d6baeb4ee0c87db063e55888
generated_at: 2026-10-14T07:46:04.908431+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mail-spool.ts

## Purpose

Implements a Claim Check store for email attachments: bytes are written durably to a spool directory, and the queue message carries only an opaque key. This decouples the attachment's lifetime from the request that staged it (surviving restarts) and prevents arbitrary file-read by ensuring only keys this module generated can be resolved to a path.

## Key elements

- **`spoolAttachment(bytes, extension)`** — Writes a `Buffer` to `<spoolRoot>/<random-hex>.<ext>` and returns the generated key.
- **`resolveSpooled(key)`** — Validates `key` against `SPOOL_KEY_PATTERN`; returns the joined path or `undefined`. The pattern gate is the security boundary against path traversal.
- **`discardSpooled(key)`** — Deletes a spooled file. Never rejects (returns `Promise.resolve()` on validation failure or via `unlinkIfPresent`).
- **`reapSpooled(retentionMs)`** — Bulk-deletes spooled files older than `retentionMs`; returns the count removed.
- **`SPOOL_KEY_PATTERN`** — `/^[\w-]{1,64}\.[\da-z]{1,8}$/`; the only shape `resolveSpooled` will accept.
- **`spoolRoot()`** (internal) — Resolves `mailFilesConfig().NODE_MAIL_SPOOL_PATH` to an absolute path.

## Relationships

- **`config.ts`** — Source of `NODE_MAIL_SPOOL_PATH` via `mailFilesConfig()`.
- **`filesystem.ts`** — Provides `reapDirectory` (used by `reapSpooled`) and `unlinkIfPresent` (used by `discardSpooled`).
- **`mailer.ts`** — Consumes `resolveSpooled` (inside `resolveAttachments`) and calls `discardSpooled` after a successful send.
- **`email.worker.ts`** — Calls `discardSpooled` in `discardJobAttachments` to clean up after a finished or dead job.
- **`scripts/ops/reap-mail-spool.ts`** — Calls `reapSpooled` as a periodic/one-shot sweep.
- **`tests/unit/infrastructure/adapters/mail-spool.test.ts`** — Direct unit tests for the four exports.
- **`tests/unit/infrastructure/adapters/mailer-attachments.test.ts`** / **`mailer-dispatch.test.ts`** — Exercise the spool indirectly through mailer's attachment flow.

## Notes

- The default path `tmp/storage/mail-spool` is a local-dev convenience. Production deployments **must** set `NODE_MAIL_SPOOL_PATH` to a mounted volume; durability comes from that mount, not the code.
- `retentionMs` passed to `reapSpooled` must exceed the full queue retry chain (`NODE_QUEUE_MAX_ATTEMPTS × NODE_QUEUE_RETRY_DELAY_SECONDS`), or the reap can delete an attachment a retry still needs.
- `discardSpooled` is deliberately side-effect-quiet (never throws/rejects) so a cleanup failure does not mask the original send error. Callers: `mailer.ts#sendInline` and `email.worker.ts#discardJobAttachments` — **not** `sendTemplatedEmail()` directly.
- The spool directory is intentionally kept outside `NODE_PUBLIC_PATH` (same rationale as `image-store.ts` quarantine) because attachments may contain personal or financial data.
