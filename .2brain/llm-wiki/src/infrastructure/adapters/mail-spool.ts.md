---
source: src/infrastructure/adapters/mail-spool.ts
sha256: 807e770f7a3ac56070a86c3d08e55d6af44aad85d552ba2b3ea5ae7c503a91fb
generated_at: 2026-10-29T01:55:49.675039+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mail-spool.ts

## Purpose

Implements the Claim Check pattern for email attachments: bytes are written durably to a local spool directory, and the queue message carries only an opaque key (the "ticket"). This decouples the attachment data from the message payload so a queued job survives process restarts, while the key-shape validation prevents a producer from ever naming a file outside the spool root.

## Key elements

- **`spoolAttachment(bytes, extension)`** — Writes a `Buffer` to the spool root under a random-hex key (`<32 hex chars>.<ext>`) and returns the key. Creates the spool directory if needed.
- **`resolveSpooled(key)`** — Validates the key against `SPOOL_KEY_PATTERN` (`/^[\w-]{1,64}\.[\da-z]{1,8}$/`) and returns `path.join(spoolRoot(), key)`, or `undefined` if the shape is wrong. The single place a key becomes a filesystem path.
- **`discardSpooled(key)`** — Deletes one spooled file via `unlinkIfPresent`. Never rejects; a cleanup failure must not mask the original send error.
- **`reapSpooled(retentionMs)`** — Batch-deletes spooled files older than the retention window via `reapDirectory`. Intended for the `reap:mail-spool` cron job.
- **`SPOOL_KEY_PATTERN`** (module-private) — The regex that every valid key must match; rejects anything not produced by `spoolAttachment`.
- **`spoolRoot()`** (module-private) — Resolves `mailFilesConfig().NODE_MAIL_SPOOL_PATH` to an absolute path. The default (`tmp/storage/mail-spool`) is a local-dev convenience; production must set the env var to a durable mount.

## Relationships

- **`src/infrastructure/adapters/filesystem.ts`** — Provides `reapDirectory` (used by `reapSpooled`) and `unlinkIfPresent` (used by `discardSpooled`).
- **`src/infrastructure/adapters/config.ts`** — Supplies `mailFilesConfig()` for the spool path.
- **`src/infrastructure/adapters/mailer.ts`** — Calls `resolveSpooled` in `resolveAttachments` (the one place a key → path) and `discardSpooled` from `sendInline`.
- **`src/infrastructure/adapters/email.worker.ts`** — Calls `discardSpooled` via `discardJobAttachments` when a job finishes or is discarded.
- **`src/app/jobs.ts`** — Registers the `reap:mail-spool` job that invokes `reapSpooled`.
- **`tests/unit/infrastructure/adapters/mail-spool.test.ts`** — Unit tests for the four exported functions.
- **`tests/unit/infrastructure/adapters/mailer-dispatch.test.ts` / `mailer-attachments.test.ts`** — Exercise the spool through the mailer's public API.

## Notes

- `discardSpooled` is intentionally fire-and-forget-safe: it never rejects. Callers (`mailer.ts#sendInline`, `email.worker.ts#discardJobAttachments`) invoke it *after* the send outcome is known, so a cleanup failure must not surface as a second error.
- `retentionMs` for `reapSpooled` must exceed `NODE_QUEUE_MAX_ATTEMPTS × NODE_QUEUE_RETRY_DELAY_SECONDS`, or it can delete an attachment a still-queued retry needs.
- The spool directory lives **outside** `NODE_PUBLIC_PATH` (same rationale as `image-store.ts`'s quarantine dir) because attachments may contain personal or financial data.
- The key is the *only* handle a producer ever sees; the file path is never exposed in a queue message. `resolveSpooled` returning `undefined` (not throwing) is the contract for invalid keys.
