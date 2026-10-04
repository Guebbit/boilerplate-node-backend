#!/usr/bin/env tsx
/**
 * @module
 * Sweeps the mail SPOOL — `npm run reap:mail-spool`. A spooled file outlives its job only when
 * something went wrong: the mail job died between `spoolAttachment()` and the send, or was lost
 * outright. This is the backstop for whatever still gets through, meant to run as a periodic job
 * (cron, a scheduled container task) rather than by hand.
 *
 * Filesystem-only and safe to run repeatedly: `NODE_MAIL_SPOOL_PATH` is never served and never
 * read by anything but `mailer.ts`, so there is nothing here a concurrent send could be relying
 * on past the retention window. It still connects to Mongo, briefly: `runScript` records this
 * job's outcome in the same `leases` collection every other crontab job does (D9,
 * `docs/reference/ops.md#scheduled-jobs`), and that collection has no other home.
 *
 * See: docs/tools/email-and-rendering.md
 */
import '@infrastructure/config/dotenv';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { reapSpooled } from '@infrastructure/adapters/mail-spool';
import { mailFilesConfig } from '@infrastructure/adapters/config';
import { runScript } from '../run-script';

/** How long a spooled file is left alone before it counts as abandoned. One hour by default — a
 * mail job settles in seconds; anything still here past that is a job that died mid-flight. */
const retentionMs = (): number =>
    mailFilesConfig().NODE_MAIL_SPOOL_RETENTION_HOURS * 60 * 60 * 1000;

/**
 * Sweep first, connect after: the sweep itself never touches Mongo, only `runScript`'s outcome
 * record does, so a Mongo outage must not block a cleanup that never needed it.
 */
const main = (): Promise<void> =>
    reapSpooled(retentionMs())
        .then((reaped) => {
            if (reaped > 0) logger.info({ message: 'Spooled mail attachments reaped.', reaped });
        })
        .then(() => startJob());

// Entry point: run `main`, record the outcome under `reap:mail-spool` for `/observability/health`, and close
// the connections on both paths. See `scripts/run-script.ts`.
void runScript('reap:mail-spool', main, stopDatabase);
