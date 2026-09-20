/**
 * @module
 * The mail spool — the Claim Check pattern for an email attachment: the bytes go here, durably,
 * and the queue message carries only the ticket. `EmailJobPayload.request.attachments` is
 * `{ filename, key }[]`, never bytes and never a path — `mailer.ts#nodemailer` is the one place a
 * key becomes a path, resolved inside the spool root, so nothing a producer writes into a queue
 * message can ever name a file outside it.
 *
 * Durable, so a job still queued when the process restarts finds its attachment intact — unlike
 * ephemeral upload staging, this must survive past one request. OUTSIDE `NODE_PUBLIC_PATH`, same
 * reasoning as `image-store.ts`'s quarantine directory: an attachment may carry personal or
 * financial data.
 *
 * See: docs/tools/email-and-rendering.md
 */

import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { logger } from '@infrastructure/adapters/logger';
import { reapDirectory } from './filesystem';

/** Where a spooled attachment lives between the request that staged it and the mail that sends it. */
const spoolRoot = (): string =>
    path.resolve(process.env.NODE_MAIL_SPOOL_PATH ?? 'storage/mail-spool');

/**
 * A spooled key's own shape: random hex, a short lowercase extension. Never anything a producer
 * chose — this is what makes {@link resolveSpooled} refuse everything else, closing off the
 * arbitrary-file-read a producer-chosen path would otherwise open the moment anything else could
 * publish to the email queue.
 */
const SPOOL_KEY_PATTERN = /^[\w-]{1,64}\.[\da-z]{1,8}$/;

/**
 * Writes an attachment's bytes to the spool and returns the key that names it.
 *
 * @param bytes - the attachment's bytes
 * @param extension - the file extension, without the leading dot (e.g. `pdf`)
 * @returns the opaque key {@link resolveSpooled} and {@link discardSpooled} address it by
 */
export const spoolAttachment = (bytes: Buffer, extension: string): Promise<string> => {
    const key = `${randomBytes(16).toString('hex')}.${extension}`;
    return mkdir(spoolRoot(), { recursive: true })
        .then(() => writeFile(path.join(spoolRoot(), key), bytes))
        .then(() => key);
};

/**
 * Resolves a spooled key to a real path, inside the spool root only. A key that does not match
 * {@link SPOOL_KEY_PATTERN} — anything a producer did not get from {@link spoolAttachment} —
 * resolves to `undefined` rather than being joined onto a path at all.
 *
 * @param key - a value {@link spoolAttachment} returned, as carried on the queue message
 * @returns the resolved path, or `undefined` for a key that does not match the shape this spool
 *   ever writes
 */
export const resolveSpooled = (key: string): string | undefined =>
    SPOOL_KEY_PATTERN.test(key) ? path.join(spoolRoot(), key) : undefined;

/**
 * Deletes a spooled attachment. Never rejects, matching `services/invoice.ts#deleteCachedInvoice`:
 * called only once a caller knows a job is finished with it — `mailer.ts#sendInline` and
 * `email.worker.ts#discardJobAttachments`, never `nodemailer()` itself — and a failed cleanup
 * must not become a second, different failure on top of whatever the send already was.
 *
 * @param key - a value {@link spoolAttachment} returned
 */
export const discardSpooled = (key: string): Promise<void> => {
    const target = resolveSpooled(key);
    if (!target) return Promise.resolve();

    return unlink(target).then(
        () => undefined,
        (error: unknown) => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                logger.warn({ message: 'Could not discard spooled attachment.', key, error });
        }
    );
};

/**
 * Deletes every spooled attachment older than `retentionMs` — `ops/reap-mail-spool.ts`'s one
 * sweep. A file survives this long only when the job that spooled it never finished: see
 * `mailer.ts` and `email.worker.ts` for who is supposed to {@link discardSpooled} it first.
 *
 * @param retentionMs - how old a spooled file must be before it counts as abandoned
 * @returns how many files were deleted
 */
export const reapSpooled = (retentionMs: number): Promise<number> =>
    reapDirectory(spoolRoot(), Date.now() - retentionMs, 'Mail spool').then(({ reaped }) => reaped);
