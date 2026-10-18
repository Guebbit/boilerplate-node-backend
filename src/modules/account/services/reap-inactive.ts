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
import { DAY_MS } from '@domain-primitives/time';

/** Fixed pause between the deletion stages — not configurable, so the one dial stays a day count. */
const GRACE_DAYS = 30;

/** The moment `days` days before now. */
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

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
const minimiseStage = (minimiseDays: number): Promise<number> =>
    userService.minimiseInactiveBefore(daysAgo(minimiseDays)).then((result) => {
        logger.info({ message: 'Inactive-account minimise stage complete.', ...result });
        return result.minimised;
    });

/** What the reaper did, per stage: accounts touched, zero for a stage that was off or had nothing. */
export interface InactiveReapCounts {
    /** Accounts stage 0 minimised. */
    minimised: number;
    /** Accounts stage 1 warned. */
    warned: number;
    /** Accounts stage 2 soft-deleted. */
    softDeleted: number;
    /** Accounts stage 3 hard-deleted. */
    hardDeleted: number;
}

/** The deletion stages' share of {@link InactiveReapCounts}. */
type DeletionCounts = Omit<InactiveReapCounts, 'minimised'>;

/** Stages 1-3, the opt-in deletion path: warn, soft delete, hard delete. */
const deletionStages = async (inactiveDays: number): Promise<DeletionCounts> => {
    const toWarn = await userService.findInactiveUnwarned(daysAgo(inactiveDays));
    for (const user of toWarn) await warn(user);

    const toSoftDelete = await userService.findWarnedStillInactive(daysAgo(GRACE_DAYS));
    // Both deletes hand a system context: nobody is at the keyboard, so the trail is the only record.
    for (const user of toSoftDelete)
        await userService.softDeleteInactive(user, systemCallerContext('User'));

    const toHardDelete = await userService.findReaperSoftDeletedPastGrace(daysAgo(GRACE_DAYS));
    // Every HTTP-driven delete records through `createDeleteController`'s spec; this one has no
    // request behind it, so it hands its own audit context.
    for (const user of toHardDelete)
        await userService.eraseInactive(user, systemCallerContext('User'));

    const counts = {
        warned: toWarn.length,
        softDeleted: toSoftDelete.length,
        hardDeleted: toHardDelete.length
    };
    logger.info({ message: 'Inactive-account reaper run complete.', ...counts });
    return counts;
};

/**
 * Run the stages in order: minimise, then the opt-in deletion path. Stage 0 runs even when
 * deletion is off, and each dial at `0` switches its own stages off.
 *
 * Needs every module's hooks registered (minimise and erase come from the manifests) and, for the
 * warning mail, translations booted; the caller owns both, and the job's lease.
 *
 * @returns how many accounts each stage handled
 * @param options - `inactiveDays`: idle days before the warning (0 = no deletion); `minimiseDays`:
 *   idle days before minimising (0 = none)
 */
export const reapInactiveAccounts = async ({
    inactiveDays,
    minimiseDays
}: {
    inactiveDays: number;
    minimiseDays: number;
}): Promise<InactiveReapCounts> => {
    const minimised = minimiseDays > 0 ? await minimiseStage(minimiseDays) : 0;
    const deleted =
        inactiveDays > 0
            ? await deletionStages(inactiveDays)
            : { warned: 0, softDeleted: 0, hardDeleted: 0 };
    return { minimised, ...deleted };
};
