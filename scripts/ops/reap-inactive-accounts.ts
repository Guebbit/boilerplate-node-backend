#!/usr/bin/env tsx
/**
 * @module
 * Three-stage inactivity reaper — `npm run reap:inactive-accounts`. Art. 5(1)(e)
 * allows keeping personal data only as long as the purpose needs it, and an account nobody has
 * touched in years has no live purpose.
 *
 * **Disabled by default** (`NODE_INACTIVE_ACCOUNT_DAYS=0`). Automatically deleting a real
 * person's account is a decision only the controller running this deployment can make — a
 * boilerplate that ships it enabled will eventually delete someone's live account.
 *
 * "Last active" is the latest refresh-token exchange (`tokens[].lastUsedAt`, already stamped on
 * every refresh) or `createdAt` for an account that has never redeemed one — see
 * `LAST_ACTIVE_EXPR` in `users/repository.ts`. Three stages, one `NODE_INACTIVE_ACCOUNT_DAYS`
 * threshold and one fixed grace between them:
 *
 *   inactive N days  → email warning, `inactivityWarnedAt` stamped
 *   + GRACE_DAYS more, still no login → soft delete (`userService.remove(user, false, systemContext)`)
 *   + GRACE_DAYS more since the soft delete → hard delete (`userService.remove(user, true)`),
 *     which runs every module's `personalData.erase` hook, exactly like an admin's own hard delete
 *
 * `inactivityWarnedAt` is what tells stage three's candidates apart from an account an admin
 * soft-deleted for an unrelated reason — see the field's own doc comment on `UserRecord`. A
 * returning user is naturally excluded from every later stage: `LAST_ACTIVE_EXPR` is recomputed
 * fresh on each run, not read off the stale warning, so signing back in undoes the clock. The one
 * gap this leaves: someone who returns and later goes inactive AGAIN keeps their old
 * `inactivityWarnedAt` and so gets no fresh warning email before stage two — acceptable for a
 * disabled-by-default safety net, not a substitute for a fuller design if this ever needs one.
 *
 * Meant to run periodically (the same cron container that runs `reap:quarantine` and
 * `reap:orders`), never on every boot. Guarded by `withLease` — the one job wired to the
 * primitive today, since a double-run here is the most expensive of the nightly jobs. Its own
 * `releaseLease` already records this job's outcome under the SAME name `withLease` takes, so
 * `runScript` below is passed no name of its own: recording again at that outer layer would
 * overwrite a genuine success with a false one whenever this process finds the lease already held
 * and skips the run entirely — `main` still resolves normally in that case.
 *
 * Removal: owned by `account` — deletes with the module, along with the `reap:inactive-accounts`
 * npm script and its `docker/crontab` line.
 *
 * See: docs/reference/ops.md
 */
import '@infrastructure/config/dotenv';
import { logger } from '@infrastructure/adapters/logger';
import { accountConfig } from '@modules/account/config';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { stopQueue } from '@infrastructure/adapters/queue';
import { bootI18n, getDefaultLocale } from '@infrastructure/i18n';
import { registerModules } from '@kernel/registry';
import { enabledModules, enabledModuleDirectories } from '../../src/modules';
import { userService, type UserDocument } from '@modules/users';
import { inactivityWarningEmail, greetableName } from '@modules/account';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { withLease } from '@infrastructure/persistence/lease';
import { systemCallerContext } from '@kernel/permissions';
import { runScript } from '../run-script';

/** Fixed pause between stages — not configurable, to keep this script's one dial to a single day count. */
const GRACE_DAYS = 30;

/**
 * How long this job holds its lease before another runner may take it over.
 *
 * Reference implementation for `withLease` — see `docs/reference/ops.md#scheduled-jobs`. Picked
 * for this because a double-run here is the most expensive of the nightly jobs: it hard-
 * deletes accounts, not just files or already-settled rows.
 *
 * Generous relative to a normal run (email enqueues, then a handful of Mongo writes per stage):
 * long enough that a slow night never gets pre-empted by its own crash-recovery window, short
 * enough that a holder that really did crash does not block next week's run for long.
 */
const LEASE_TTL_MS = 15 * 60 * 1000;

/** The moment `days` days before now. */
const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/**
 * Bring up just enough of the app's own boot sequence (`app.ts`'s `createApp().boot`) to render
 * translated email copy outside the HTTP process. Nothing else `boot`/`start` does (cache, queue
 * readiness, route mounting) is this script's concern.
 */
const initI18n = (): Promise<unknown> => bootI18n(enabledModuleDirectories('locales'));

/** Stage one: warn, and stamp so this account is not warned twice. */
const warn = (user: UserDocument): Promise<void> => {
    // The name only when the address is the verified one: this mail also goes to accounts that
    // never proved theirs, and a display name is user-supplied text.
    const mail = inactivityWarningEmail(
        user.locale ?? getDefaultLocale(),
        greetableName(user, user.email),
        GRACE_DAYS
    );
    return enqueueEmail({ to: user.email, subject: mail.subject }, mail.template, mail.data).then(
        () => userService.markInactivityWarned(user).then(() => undefined)
    );
};

/** The three stages in order (warn, soft delete, hard delete), under the job's lease. */
const main = async (): Promise<void> => {
    const inactiveDays = accountConfig().NODE_INACTIVE_ACCOUNT_DAYS;
    if (inactiveDays <= 0) {
        logger.info({
            message: 'Inactive-account reaper disabled (NODE_INACTIVE_ACCOUNT_DAYS <= 0).'
        });
        return;
    }

    // The lease lives in Mongo, so the connection comes before it.
    await startJob();

    const ran = await withLease('reap:inactive-accounts', LEASE_TTL_MS, async () => {
        registerModules(enabledModules);
        await initI18n();

        const toWarn = await userService.findInactiveUnwarned(daysAgo(inactiveDays));
        for (const user of toWarn) await warn(user);

        const toSoftDelete = await userService.findWarnedStillInactive(
            daysAgo(inactiveDays + GRACE_DAYS)
        );
        // Both deletes hand a system context: nobody is at the keyboard, so the trail is the only record.
        for (const user of toSoftDelete)
            await userService.remove(user, false, systemCallerContext('User'));

        const toHardDelete = await userService.findReaperSoftDeletedPastGrace(daysAgo(GRACE_DAYS));
        // Every HTTP-driven delete records through `createDeleteController`'s spec; this one has no
        // request behind it, so it hands its own audit context.
        for (const user of toHardDelete)
            await userService.remove(user, true, systemCallerContext('User'));

        logger.info({
            message: 'Inactive-account reaper run complete.',
            warned: toWarn.length,
            softDeleted: toSoftDelete.length,
            hardDeleted: toHardDelete.length
        });
    });

    if (ran === undefined) {
        logger.info({
            message: 'Inactive-account reaper skipped: another holder already has the lease.'
        });
    }
};

// Entry point: run `main` and close the connections on both paths. Records no outcome here
// (`undefined`): this job records through its own lease document. See `scripts/run-script.ts`.
void runScript(undefined, main, () => Promise.all([stopDatabase(), stopQueue()]));
