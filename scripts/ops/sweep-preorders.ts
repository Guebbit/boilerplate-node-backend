#!/usr/bin/env tsx
/**
 * @module
 * The daily preorder sweep — `npm run sweep:preorders`.
 *
 * Does:      asks the buyer of every waiting preorder whose expected date passed whether to keep
 *            waiting, and announces every wait whose 30 days of silence ran out so `returns` can
 *            cancel and refund it. Both are legal duties once a preorder exists (FTC 16 CFR 435.2,
 *            CRD Art. 18), which is why this is a job and not an admin's chore.
 * Registers: `registerModules` first — the expiry rides the outbox to `returns`, and the buyer's
 *            notice reaches `notifications` by event; without the modules registered nobody hears.
 * i18n:      `bootI18n` is for the notice emails.
 * Runs:      once a day, under a lease — see docs/reference/ops.md#scheduled-jobs. A day is the
 *            right grain: the dates are days, and the margin is already two days wide.
 * Repeat:    safe. A date that was noticed is not noticed again, and a wait that expired stays
 *            expired until its cancel lands.
 * Removal:   owned by `delivery` — deletes with the module, along with the `sweep:preorders` npm
 *            script and its `docker/crontab` line.
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { stopQueue } from '@infrastructure/adapters/queue';
import { bootI18n } from '@infrastructure/i18n';
import { registerModules } from '@kernel/registry';
import { settleOutboxNudges } from '@kernel/outbox';
import { enabledModules, enabledModuleDirectories } from '../../src/modules';
import { runPreorderSweep } from '@modules/delivery';
import { logger } from '@infrastructure/adapters/logger';
import { withLease } from '@infrastructure/persistence/lease';
import { runScript } from '../run-script';

/** How long a holder that never releases (a crash) blocks the next run: well under a day. */
const LEASE_TTL_MS = 30 * 60 * 1000;

/**
 * Connect, install the event subscriptions, then run one pass under the job's lease. Each notice
 * and each expiry rides the outbox; it is settled inside the lease so `notifications` and `returns`
 * have heard every one before the connections close.
 */
const main = (): Promise<void> =>
    startJob()
        .then(() => {
            registerModules(enabledModules);
            return bootI18n(enabledModuleDirectories('locales'));
        })
        .then(() =>
            withLease('sweep:preorders', LEASE_TTL_MS, () =>
                runPreorderSweep()
                    .then((result) => {
                        logger.info({ message: 'Preorder sweep done.', ...result });
                    })
                    .then(() => settleOutboxNudges())
            )
        )
        .then((ran) => {
            if (ran === undefined)
                logger.info({
                    message: 'Preorder sweep skipped: another holder already has the lease.'
                });
        });

// Entry point: run `main`, and close the connections on both paths. No job name is passed: the
// lease records this job's outcome under `sweep:preorders` itself. See `scripts/run-script.ts`.
void runScript(undefined, main, () => Promise.all([stopDatabase(), stopQueue()]));
