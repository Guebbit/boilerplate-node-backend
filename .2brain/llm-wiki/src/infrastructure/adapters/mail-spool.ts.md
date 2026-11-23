---
source: src/infrastructure/adapters/mail-spool.ts
source_sha256: cc6c3cf602f7d82c65131f1210b9ed725523e24bd838d90dd2dab405e68e6aba
context_sha256: 6bf6964de8a1c725858f991872b945d3150a1a6955346e3fab08fff58325459c
generated_at: 2026-11-22T02:39:38.972980+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/mail-spool.ts

## Purpose
The mail spool implements the Claim Check pattern for email attachments. Attachment bytes are written to a durable directory, and the queue message carries only a key (`EmailJobPayload.request.attachments` is `{ filename, key }[]`), never bytes or a path. A queued job therefore still finds its attachment after a process restart. The spool sits outside `NODE_PUBLIC_PATH` because attachments may hold personal or financial data.

## Key elements
- `spoolRoot()` (private): resolves `mailFilesConfig().NODE_MAIL_SPOOL_PATH`. The `tmp/storage/mail-spool` default is only a local-dev convenience. Real deployments set the variable to a mounted volume, and that mount provides the durability.
- `SPOOL_KEY_PATTERN` (private): `/^[\w-]{1,64}\.[\da-z]{1,8}$/`. This is the only key shape the spool ever writes.
- `spoolAttachment(bytes, extension)`: creates the spool directory if needed. It writes the bytes under `<32 hex chars>.<extension>` and resolves to that key. The extension is given without the leading dot.
- `resolveSpooled(key)`: returns a path inside the spool root. It returns `undefined` if the key doesn't match `SPOOL_KEY_PATTERN`, and in that case it does no path joining at all.
- `discardSpooled(key)`: deletes a spooled file through `unlinkIfPresent`. It never rejects, and it is a no-op for an invalid key.
- `reapSpooled(retentionMs)`: deletes every spooled file older than `retentionMs` through `reapDirectory`. It resolves to the number of files deleted. This is the sweep behind `reap:mail-spool`.

## Relationships
- `config.ts`: supplies `mailFilesConfig()` and with it `NODE_MAIL_SPOOL_PATH`.
- `filesystem.ts`: supplies `reapDirectory` and `unlinkIfPresent`, which do the actual deletion and reaping.
- `mailer.ts`: `resolveAttachments` is the one place a key becomes a path, and it goes through `resolveSpooled`. `sendInline` calls `discardSpooled`.
- `email.worker.ts`: `discardJobAttachments` calls `discardSpooled` once a job is finished with its attachments.
- The other neighbors (`jobs.ts`, `held-jobs.ts`, and the unit and integration tests) are in the dependency graph. The file content doesn't show how they use this module.

## Notes
- **Security:** because keys are validated against `SPOOL_KEY_PATTERN`, a producer can't name a file outside the spool through a queue message. This closes off an arbitrary-file-read.
- **Retention:** `retentionMs` must exceed a queued job's whole retry chain (`NODE_QUEUE_MAX_ATTEMPTS` × `NODE_QUEUE_RETRY_DELAY_SECONDS`). Otherwise the reaper can delete an attachment that a retry still needs.
- **Discard timing:** discard is called only once a job is finished with the attachment. `sendTemplatedEmail()` itself never discards. Files that survive until the reaper runs belong to jobs that never finished.
- **Never rejects:** `discardSpooled` swallows cleanup failures, so they don't become a second failure on top of the send's own.
