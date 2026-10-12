#!/usr/bin/env tsx
/**
 * @module
 * Forget the previous email of every account whose 7-day undo link is gone —
 * `npm run reap:previous-emails`.
 *
 * A confirmed email change keeps the old address only for that link, so once the link lapses (it
 * expired, was spent, or was revoked) the address goes. One `updateMany` over accounts holding a
 * `previousEmail`, an unindexed scan: that is why it runs here, nightly. Expired sessions and
 * one-time tokens need no job, since every row carries a TTL date and the database deletes it.
 *
 * Safe to repeat, and guarded by `withLease` anyway: a second runner would only scan the same
 * documents for nothing. The lease records this job's outcome under `reap:previous-emails` itself,
 * so `runScript` is passed no name (a skipped run must not be recorded as a success).
 *
 * Owned by `account` — deletes with the module, along with the `reap:previous-emails` npm script
 * and its `docker/crontab` line.
 *
 * See: docs/reference/ops.md
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { logger } from '@infrastructure/adapters/logger';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { withLease } from '@infrastructure/persistence/lease';
import { reapLapsedPreviousEmails } from '@modules/account';
import { runScript } from '../run-script';

/** How long a holder that never releases (a crash) blocks the next run. */
const LEASE_TTL_MS = 30 * 60 * 1000;

/** Connect (the lease lives in Mongo), then sweep under the lease. */
const main = (): Promise<void> =>
    startJob()
        .then(() => withLease('reap:previous-emails', LEASE_TTL_MS, reapLapsedPreviousEmails))
        .then((cleared) => {
            if (cleared === undefined)
                logger.info({
                    message: 'Previous-email reaper skipped: another holder already has the lease.'
                });
            else
                logger.info({ message: 'Previous emails reaped.', previousEmailsCleared: cleared });
        });

// Entry point: run `main`, and close the connection on both paths. No job name is passed: the
// lease records the outcome. See `scripts/run-script.ts`.
void runScript(undefined, main, stopDatabase);
