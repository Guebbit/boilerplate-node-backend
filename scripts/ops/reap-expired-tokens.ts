#!/usr/bin/env tsx
/**
 * @module
 * Drop expired tokens from every account — `npm run reap:expired-tokens`.
 *
 * What goes: every expired entry in `users.tokens`, plus every rotated-away refresh token older
 * than the REUSE-DETECTION window (not the rotation grace window: a superseded entry has to
 * survive as long as reuse detection is willing to look for it). One `$pull` across the whole
 * collection, so it is an unindexed scan; that is why it runs here, nightly, and not on the
 * login and refresh paths, where an anonymous request could schedule it. Those two prune only
 * their own account (`src/modules/account/session/prune.ts`).
 *
 * Safe to repeat, and guarded by `withLease` anyway: a second runner would only scan the same
 * documents for nothing. The lease records this job's outcome under `reap:expired-tokens` itself,
 * so `runScript` is passed no name (a skipped run must not be recorded as a success).
 *
 * Owned by `account` — deletes with the module, along with the `reap:expired-tokens` npm script
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
import { reapExpiredTokens } from '@modules/account';
import { runScript } from '../run-script';

/**
 * How long a holder that never releases (a crash) blocks the next run. The sweep is one `$pull`:
 * minutes on a large collection, so this is generous without outliving the night.
 */
const LEASE_TTL_MS = 30 * 60 * 1000;

/** Connect (the lease lives in Mongo), then sweep every account's expired tokens under the lease. */
const main = (): Promise<void> =>
    startJob()
        .then(() => withLease('reap:expired-tokens', LEASE_TTL_MS, reapExpiredTokens))
        .then((pruned) => {
            if (pruned === undefined)
                logger.info({
                    message: 'Expired-token reaper skipped: another holder already has the lease.'
                });
            else logger.info({ message: 'Expired tokens reaped.', accountsPruned: pruned });
        });

// Entry point: run `main`, and close the connection on both paths. No job name is passed: the
// lease records the outcome. See `scripts/run-script.ts`.
void runScript(undefined, main, stopDatabase);
