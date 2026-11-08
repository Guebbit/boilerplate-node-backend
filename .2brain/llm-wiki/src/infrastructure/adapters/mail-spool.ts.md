---
source: src/infrastructure/adapters/mail-spool.ts
sha256: 33a5604c378572dd34c58d65255cf24136e59dcc4264ceac1f3dd4c7b1811801
generated_at: 2026-11-08T03:21:05.684491+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mail-spool.ts

## Purpose

Implements the Claim Check pattern for email attachments: bytes are written durably to a local spool directory, and the queue message carries only an opaque key (never bytes, never a filesystem path). This lets a job survive a process restart with its attachment intact, while keeping potentially sensitive files outside `NODE_PUBLIC_PATH`.

## Key elements

- **`spoolAttachment(bytes, extension)`** — writes attachment bytes into the spool root and returns an opaque key (`<32-hex>.<ext>`). The key is always server-generated.
- **`resolveSpooled(key)`** — validates the key against `SPOOL_KEY_PATTERN` (`^[\w-]{1,64}\.[\da-z]{1,8}$`); returns the joined path or `undefined`. The only place a key becomes a real path.
- **`discardSpooled(key)`** — deletes a spooled file. Never rejects; a cleanup failure must not shadow the original send failure.
- **`reapSpooled(retentionMs)`** — bulk-deletes spooled files older than `retentionMs`; returns the count deleted. Backs the `reap:mail-spool` scheduled job.
- **`spoolRoot()`** (internal) — resolves the spool directory from `mailFilesConfig().NODE_MAIL_SPOOL_PATH`.
- **`SPOOL_KEY_PATTERN`** (internal) — strict shape check that closes off arbitrary-file-read via a producer-chosen key.

## Relationships

- **`config.ts`** — provides `mailFilesConfig()` which supplies `NODE_MAIL_SPOOL_PATH` (the spool directory).
- **`filesystem.ts`** — provides `reapDirectory` (used by `reapSpooled`) and `unlinkIfPresent` (used by `discardSpooled`).
- **`mailer.ts`** — `resolveAttachments` is the sole consumer of `resolveSpooled`; `sendInline` and `sendTemplatedEmail` call `discardSpooled` after sending.
- **`email.worker.ts`** — `discardJobAttachments` calls `discardSpooled` to clean up after a job's final failure.
- **`jobs.ts`** — registers the `reap:mail-spool` periodic job that invokes `reapSpooled`.
- **Tests** — `mail-spool.test.ts` covers the spool functions directly; `mailer-attachments.test.ts` and `mailer-dispatch.test.ts` exercise the key→path resolution path in context.

## Notes

- **Security boundary:** `resolveSpooled` is the *only* code path that turns a key into a filesystem path, and it rejects anything not matching the strict hex+extension shape. This is intentional: a producer writing to the email queue must not be able to name an arbitrary file.
- **Spool location:** The default `tmp/storage/mail-spool` is a local-dev convenience. Production must set `NODE_MAIL_SPOOL_PATH` to a durable mounted volume — the same reasoning as `image-store.ts`'s quarantine directory.
- **Retention window:** `retentionMs` passed to `reapSpooled` must exceed the job's full retry chain (`NODE_QUEUE_MAX_ATTEMPTS` × `NODE_QUEUE_RETRY_DELAY_SECONDS`), or a still-retrying job loses its attachment mid-flight.
- **`discardSpooled` is best-effort:** it swallows errors by design. Callers invoke it *after* the send outcome is already known, so a disk error during cleanup must not surface as a second, confusing failure.
