---
source: src/infrastructure/adapters/mail-spool.ts
sha256: 6b3fb410b78a8ebf724dec4c2fc868cb5fb08c6f1422ac71db948e4405e1270a
generated_at: 2026-10-01T12:49:29.714251+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mail-spool.ts

## Purpose

Implements the Claim Check pattern for email attachments: bytes are written durably to a spool directory and the queue message carries only an opaque key (never bytes, never a path). The key is resolved back to a path in exactly one place (`mailer.ts#resolveAttachments`) inside the spool root. The spool exists so attachments survive process restarts while a job is still queued, and so a producer can never inject a path that names a file outside the spool.

## Key elements

- **`spoolAttachment(bytes, extension)`** — Writes an attachment's bytes under a randomly generated hex key (`randomBytes(16).toString('hex')`) plus the given extension; returns the key. Creates the spool directory if needed.
- **`resolveSpooled(key)`** — Validates the key against `SPOOL_KEY_PATTERN`; returns the resolved path inside the spool root, or `undefined` if the key shape is anything other than this module's own output.
- **`discardSpooled(key)`** — Deletes a spooled file. Never rejects: a failed cleanup must not become a second failure on top of the send that already finished.
- **`reapSpooled(retentionMs)`** — Deletes every spooled file older than the retention window; returns the count. Intended as a periodic sweep for files whose owning job never completed.
- **`SPOOL_KEY_PATTERN`** (`/^[\w-]{1,64}\.[\da-z]{1,8}$/`) — The only shape `resolveSpooled` accepts; everything else is refused outright, closing off arbitrary-file-read via a forged key.
- **`spoolRoot()`** (internal) — Resolves `mailFilesConfig().NODE_MAIL_SPOOL_PATH` to an absolute path.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — Supplies `mailFilesConfig()` which provides `NODE_MAIL_SPOOL_PATH`.
- **`src/infrastructure/adapters/filesystem.ts`** — Provides `reapDirectory` (used by `reapSpooled`) and `unlinkIfPresent` (used by `discardSpooled`).
- **`src/infrastructure/adapters/mailer.ts`** — Consumer: `resolveAttachments` calls `resolveSpooled`; `sendInline` calls `discardSpooled` after the send.
- **`src/infrastructure/adapters/email.worker.ts`** — Consumer: `discardJobAttachments` calls `discardSpooled` to clean up attachments for a finished/failed job.
- **`scripts/ops/reap-mail-spool.ts`** — Operator script that calls `reapSpooled` on a schedule to reclaim files from abandoned jobs.
- **`tests/unit/infrastructure/adapters/mail-spool.test.ts`** — Unit tests for spool/resolve/discard/reap behavior.
- **`tests/unit/infrastructure/adapters/mailer-attachments.test.ts`** / **`mailer-dispatch.test.ts`** — Test the mailer's use of spooled keys in the dispatch and attachment flows.

## Notes

- **Security boundary:** The spool root is deliberately placed *outside* `NODE_PUBLIC_PATH`. Attachments may carry personal or financial data; they must not be web-servable. Same reasoning as `image-store.ts`'s quarantine directory.
- **`discardSpooled` is fire-and-forget by contract.** It is called only after the caller knows the job is done with the file, and a rejection here would mask the real send error. It resolves to `void` unconditionally.
- **`reapSpooled` retention must exceed the full retry chain** (`NODE_QUEUE_MAX_ATTEMPTS × NODE_QUEUE_RETRY_DELAY_SECONDS`), or a still-queued retry could find its attachment already gone.
- **Default path `tmp/storage/mail-spool` is a local-dev convenience only.** Production deployments must set `NODE_MAIL_SPOOL_PATH` to a durable mounted volume; the default gives no crash-recovery guarantees.
- **Key opacity is the security model.** Producers receive a key from `spoolAttachment` and must pass it back unchanged. `resolveSpooled` is the single choke point that turns a key into a filesystem path, and it rejects anything not matching the module's own output shape.
