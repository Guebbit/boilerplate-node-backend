#!/usr/bin/env tsx
/**
 * @module
 * Delete built data exports past their retention — `npm run reap:account-exports`.
 *
 * An export is kept for `NODE_ACCOUNT_EXPORT_TTL_DAYS` (7) after it is ready, then its file and its
 * row go. It is a regenerable copy of what the account's own data already says, so a reaped export
 * costs the account one new request and nothing else. A second sweep removes files no row points at
 * any more (a failed delete, an abandoned temporary file) by their age.
 *
 * Safe to repeat: every delete is of something already due, and a missing file is not an error. It
 * needs Mongo for the rows and for `runScript`'s own outcome record.
 *
 * Owned by `account` — deletes with the module, along with the `reap:account-exports` npm script
 * and its `docker/crontab` line.
 *
 * See: docs/modules/account.md#data-export
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { reapExpiredExports } from '@modules/account';
import { runScript } from '../run-script';

/** Connect (the rows live in Mongo), then delete every export that is due. */
const main = (): Promise<void> =>
    startJob()
        .then(reapExpiredExports)
        .then(({ rows, files }) =>
            logger.info({ message: 'Account exports reaped.', rows, strayFiles: files })
        );

// Entry point: run `main`, record the outcome under `reap:account-exports` for
// `/observability/health`, and close the connection on both paths. See `scripts/run-script.ts`.
void runScript('reap:account-exports', main, stopDatabase);
