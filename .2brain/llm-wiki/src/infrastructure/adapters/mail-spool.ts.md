---
source: src/infrastructure/adapters/mail-spool.ts
sha256: 172ee8f5cddd233689138b978f6c37bf7610edc6b6f5cf8b7574cee5be862969
generated_at: 2026-09-23T17:40:32.489597+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mail-spool.ts

## Purpose

Implements the **Claim Check** pattern for email attachments: the attachment bytes are written durably to a local spool directory and the queue message carries only a random hex key (a "ticket"). This decouples attachment storage from the queue payload, guarantees the bytes survive a process restart while a job is still queued, and — because keys are server-generated and shape-validated — prevents any producer from injecting an arbitrary file path into the mail-sending pipeline.

## Key elements

- **`spoolAttachment(bytes, extension)`** — Writes the attachment to the spool root under a `randomBytes(16).hex.<ext>` name; returns that opaque key.
- **`resolveSpooled(key)`** — Validates the key against `SPOOL_KEY_PATTERN` (`^[\w-]{1,64}\.[\da-z]{1,8}$`); returns the absolute path inside the spool root or `undefined`. The sole code path by which a key becomes a filesystem path.
- **`discardSpooled(key)`** — Deletes a spooled file via `unlinkIfPresent`. Never rejects: a cleanup failure must not become a second error layered on top of the send result.
- **`reapSpooled(retentionMs)`** — Bulk-deletes spooled files older than `retentionMs`. Intended as the single sweep invoked by the ops script.
- **`SPOOL_KEY_PATTERN`** (module-internal) — The strict shape gate that makes `resolveSpooled` a security boundary rather than a path join.
- **`spoolRoot()`** (module-internal) — Resolves `NODE_MAIL_SPOOL_PATH` env or falls back to `tmp/storage/mail-spool` (dev-only default).

## Relationships

- **`src/infrastructure/adapters/filesystem.ts`** — Supplies the `reapDirectory` and `unlinkIfPresent` primitives this module builds on.
- **`src/infrastructure/adapters/mailer.ts`** — The only caller of `resolveSpooled` (turns a key into a path for nodemailer) and one of two callers of `discardSpooled` (after `sendInline`).
- **`src/infrastructure/adapters/email.worker.ts`** — The other caller of `discardSpooled` (cleans up all job attachments after the send attempt finishes).
- **`src/modules/orders/services/notify.ts`** — Producer side: calls `spoolAttachment` to stage a bytes payload before enqueueing the mail job.
- **`scripts/ops/reap-mail-spool.ts`** — Ops script that invokes `reapSpooled` on a schedule.
- **`tests/unit/infrastructure/adapters/mail-spool.test.ts`** — Unit tests for the spool functions themselves.
- **`tests/unit/infrastructure/adapters/mailer-attachments.test.ts` / `mailer-dispatch.test.ts`** — Exercise the mailer's attachment path, which depends on this module's key contract.

## Notes

- The default spool path (`tmp/storage/mail-spool`) is a **local-dev convenience only**. A real deployment must set `NODE_MAIL_SPOOL_PATH` to a mounted volume; durability comes from that mount, not the default.
- The spool directory deliberately lives **outside `NODE_PUBLIC_PATH`** (same reasoning as `image-store.ts`'s quarantine dir) because attachments may contain personal or financial data.
- `retentionMs` passed to `reapSpooled` **must exceed** the full queue retry window (`NODE_QUEUE_MAX_ATTEMPTS × NODE_QUEUE_RETRY_DELAY_SECONDS`), otherwise a still-retrying job will find its attachment deleted.
- `discardSpooled` resolves `undefined` → `Promise.resolve()` for malformed keys rather than throwing, keeping the "never rejects" contract intact.
