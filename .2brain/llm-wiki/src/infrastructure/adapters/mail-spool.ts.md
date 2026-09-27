---
source: src/infrastructure/adapters/mail-spool.ts
sha256: f8c7fc00e845f3c9e69306925150c27823dfa93d5cd088f3c1625db49f953120
generated_at: 2026-09-27T14:06:50.079887+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mail-spool.ts

## Purpose

Implements the Claim Check pattern for email attachments: attachment bytes are written durably to a local spool directory, and the queue message carries only an opaque key (never bytes, never a path). This decouples the producer's request lifecycle from the mailer's send lifecycle, so a job queued across a process restart still finds its attachment intact.

## Key elements

- **`spoolAttachment(bytes, extension)`** — Writes attachment bytes to the spool root and returns an opaque key (`<32-hex>.<ext>`). The key is generated with `randomBytes(16)`, never derived from producer input.
- **`resolveSpooled(key)`** — Validates the key against `SPOOL_KEY_PATTERN` (`/^[\w-]{1,64}\.[\da-z]{1,8}$/`); returns a path joined inside the spool root, or `undefined` for anything that doesn't match. This is the only place a key becomes a filesystem path.
- **`discardSpooled(key)`** — Deletes a single spooled file. Never rejects: a failed cleanup must not stack a second error on top of an already-failed send.
- **`reapSpooled(retentionMs)`** — Bulk-deletes files older than the retention window. Intended to be called by the ops reap script, not inline.
- **`spoolRoot()`** (internal) — Resolves to `NODE_MAIL_SPOOL_PATH` or falls back to `tmp/storage/mail-spool` (local-dev only).
- **`SPOOL_KEY_PATTERN`** (internal) — Regex that gates `resolveSpooled`; closes off arbitrary-file-read if a producer could publish to the queue.

## Relationships

- **`src/infrastructure/adapters/filesystem.ts`** — Imports `reapDirectory` (used by `reapSpooled`) and `unlinkIfPresent` (used by `discardSpooled`).
- **`src/infrastructure/adapters/mailer.ts`** — Calls `resolveSpooled` to locate attachment bytes at send time and `discardSpooled` in `sendInline` to clean up after dispatch.
- **`src/infrastructure/adapters/email.worker.ts`** — Calls `discardSpooled` via `discardJobAttachments` when a job exhausts retries or completes.
- **`src/modules/orders/services/notify.ts`** — Producer side: calls `spoolAttachment` to stage bytes and stores the returned key on `EmailJobPayload.request.attachments`.
- **`scripts/ops/reap-mail-spool.ts`** — Operational entry point that calls `reapSpooled` with a retention window.
- **`tests/unit/infrastructure/adapters/mail-spool.test.ts`** — Unit tests for all four exports.
- **`tests/unit/infrastructure/adapters/mailer-attachments.test.ts`** / **`mailer-dispatch.test.ts`** — Exercise `resolveSpooled`/`discardSpooled` in the context of the mailer's send path.

## Notes

- The spool directory is deliberately **outside** `NODE_PUBLIC_PATH`; attachments may carry personal or financial data (same reasoning as `image-store.ts`'s quarantine directory).
- `reapSpooled`'s `retentionMs` must exceed the job's full retry chain (`NODE_QUEUE_MAX_ATTEMPTS` × `NODE_QUEUE_RETRY_DELAY_SECONDS`), or it can delete an attachment a pending retry still needs.
- `discardSpooled` is intentionally called only by the consumer (`mailer.ts`, `email.worker.ts`), never by `sendTemplatedEmail()` itself — the caller must know the job is finished with the attachment first.
- The local-dev default path (`tmp/storage/mail-spool`) is a convenience; real deployments always set `NODE_MAIL_SPOOL_PATH` to a mounted volume for durability.
