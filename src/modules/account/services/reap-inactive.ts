/**
 * @module
 * The inactivity reaper's stages, kept apart from its cron script so the order they run in is a
 * tested fact rather than a property of a file nobody imports. Two dials, four stages:
 *
 * ```
 * minimiseDays   0. minimise  every module's `personalData.minimise`, then `inactivityMinimisedAt`
 * inactiveDays   1. warn      email, `inactivityWarnedAt` stamped
 *                2. soft delete, GRACE_DAYS after the warning
 *                3. hard delete, GRACE_DAYS after the soft delete
 * ```
 *
 * See: docs/theory/data-retention.md#inactive-accounts-minimise-don-t-delete
 */

import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { getDefaultLocale } from '@infrastructure/i18n';
import { systemCallerContext } from '@kernel/permissions';
import { userService, type UserDocument } from '@modules/users';
import { inactivityWarningEmail, greetableName } from '../emails';

/** Fixed pause between the deletion stages — not configurable, so the one dial stays a day count. */
const GRACE_DAYS = 30;

/** The moment `days` days before now. */
const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

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

/**
 * Stage 0: minimise every account quiet past `minimiseDays`. A failure is logged per account and
 * retried next night, never stopping the rest.
 */
const minimiseStage = (minimiseDays: number): Promise<void> =>
    userService.minimiseInactiveBefore(daysAgo(minimiseDays)).then((result) => {
        logger.info({ message: 'Inactive-account minimise stage complete.', ...result });
    });

/** Stages 1-3, the opt-in deletion path: warn, soft delete, hard delete. */
const deletionStages = async (inactiveDays: number): Promise<void> => {
    const toWarn = await userService.findInactiveUnwarned(daysAgo(inactiveDays));
    for (const user of toWarn) await warn(user);

    const toSoftDelete = await userService.findWarnedStillInactive(daysAgo(GRACE_DAYS));
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
};

/**
 * Run the stages in order: minimise, then the opt-in deletion path. Stage 0 runs even when
 * deletion is off, and each dial at `0` switches its own stages off.
 *
 * Needs every module's hooks registered (minimise and erase come from the manifests) and, for the
 * warning mail, translations booted; the caller owns both, and the job's lease.
 *
 * @param options - `inactiveDays`: idle days before the warning (0 = no deletion); `minimiseDays`:
 *   idle days before minimising (0 = none)
 */
export const reapInactiveAccounts = async ({
    inactiveDays,
    minimiseDays
}: {
    inactiveDays: number;
    minimiseDays: number;
}): Promise<void> => {
    if (minimiseDays > 0) await minimiseStage(minimiseDays);
    if (inactiveDays > 0) await deletionStages(inactiveDays);
};
