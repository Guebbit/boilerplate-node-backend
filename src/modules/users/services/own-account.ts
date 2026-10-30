/**
 * @module
 * The doors `account` reaches the user record through for what the admin doors (`updateById`,
 * `removeById`) cannot serve: the owner editing their own profile, the owner's scheduled deletion
 * (lock, restore, and the purge once its grace has run out), and the inactivity reaper's two
 * deletes.
 *
 * Each door narrows the raw `update` / `remove` it wraps. Those two skip the ban check and the
 * staff protection the admin doors enforce, so they stay `@internal` and only these reach them.
 */

import { ERROR_CODES } from '@api/error-codes';
import { t } from '@infrastructure/i18n';
import {
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { CallerContext } from '@types';
import { accessService } from '@modules/access';
import type { UserDocument } from '../model';
import { update, type SaveHook } from './update';
import { remove, erase } from './remove';
import { userRepository } from '../repository';
import { markSessionsEnded } from './credentials';

/**
 * What the owner may write on their own profile: everything an admin edit carries except `active`.
 * A profile edit can therefore never ban, or unban, the account it belongs to; `role` is already
 * absent from {@link update}'s data.
 */
export type OwnProfileData = Omit<Parameters<typeof update>[1], 'active'>;

/**
 * Save the owner's edit to their own profile.
 *
 * @param user - the loaded account, the caller's own
 * @param data - the validated profile fields; no `active`, no `role`
 * @param context - the caller, for the audit row
 * @param alsoInSave - a write that commits with the save (an outbox row), or `undefined`
 */
export const updateOwnProfile = (
    user: UserDocument,
    data: OwnProfileData,
    context: CallerContext,
    alsoInSave?: SaveHook
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    update(user, data, context, undefined, alsoInSave);

/**
 * Soft-delete an account the inactivity reaper found idle past its warning. The reaper hands a
 * system context, so the trail records `SYSTEM_USER_SOFT_DELETED` and the row is stamped as the
 * reaper's own, which is what later lets {@link eraseInactive} take it.
 *
 * Refused with 409 for an account that was never warned (the warning is the notice that makes this
 * deletion fair) and for one that holds a staff role (the reaper reads customers only, so a staff
 * account here means a read went wrong, and the cost of that is a locked-out administrator).
 *
 * @param user - an account the reaper's read returned (customers only)
 * @param context - the reaper's system context
 */
export const softDeleteInactive = (
    user: UserDocument,
    context: CallerContext
): ReturnType<typeof remove> => {
    if (!user.inactivityWarnedAt)
        return Promise.resolve(
            generateReject(409, [
                { code: ERROR_CODES.USER_NOT_WARNED, message: t('users.not-warned') }
            ])
        );

    return accessService.holdsStaffRole(String(user._id)).then((staff) =>
        staff
            ? generateReject(409, [
                  {
                      code: ERROR_CODES.USER_STAFF_NOT_REAPABLE,
                      message: t('users.inactive-staff-account')
                  }
              ])
            : remove(user, false, context)
    );
};

/**
 * Hard-delete an account the reaper soft-deleted itself, once its grace has run out. A row
 * soft-deleted by anyone else (an admin deleting an account is a decision to keep it restorable)
 * is refused with 409, so the reaper can never finish what it did not start.
 *
 * @param user - an account the reaper's read returned
 * @param context - the reaper's system context
 */
export const eraseInactive = (
    user: UserDocument,
    context: CallerContext
): ReturnType<typeof remove> =>
    user.deletedBy === 'reaper'
        ? remove(user, true, context)
        : Promise.resolve(
              generateReject(409, [
                  {
                      code: ERROR_CODES.USER_NOT_REAPER_DELETED,
                      message: t('users.not-reaper-deleted')
                  }
              ])
          );

/**
 * Lock the caller's own account and promise its erasure at `purgeAt`: one save that stamps
 * `deletedAt`, `deletedBy: 'owner'` and `purgeAt` and moves the session epoch, so every token the
 * account holds dies with it. It does not go through {@link remove}, which would audit an admin
 * action; the account's caller records the owner's own.
 *
 * @param user - the loaded account, the caller's own
 * @param requestedAt - when the owner asked; becomes `deletedAt`
 * @param purgeAt - when the erasure falls due, decided by the caller (the grace rule is `account`'s)
 */
export const scheduleOwnDeletion = (
    user: UserDocument,
    requestedAt: Date,
    purgeAt: Date
): Promise<UserDocument> => {
    user.deletedAt = requestedAt;
    user.deletedBy = 'owner';
    user.purgeAt = purgeAt;
    markSessionsEnded(user, requestedAt);
    return userRepository.save(user);
};

/**
 * Bring back an account whose owner scheduled its deletion, if the grace has not run out. The
 * state itself is the proof: callers hold it through a spent link or a passed sign-in. Sessions
 * stay dead; the owner signs in afresh.
 *
 * @param user - the account to restore
 * @param now - the moment to judge `purgeAt` against
 * @returns whether THIS call restored it; `false` once the purge is due, or if another restore won
 */
export const restoreOwnAccount = (user: UserDocument, now: Date = new Date()): Promise<boolean> =>
    userRepository.restoreScheduledDeletion(user.id, now);

/**
 * Hard-delete an account whose owner-scheduled grace has run out: the purge job's door. The first
 * write of the transaction is a claim on `purgeAt <= now`, so a restore that got there first
 * wins and this refuses with 409. The context is the job's system one, so the trail says
 * `SYSTEM_USER_ERASED`, not an admin erase.
 *
 * @param user - an account the due read returned
 * @param context - the purge job's system context
 * @param now - the moment `purgeAt` is judged against; app time, never the database's clock
 */
export const eraseScheduledDeletion = (
    user: UserDocument,
    context: CallerContext,
    now: Date = new Date()
): ReturnType<typeof erase> =>
    erase(user, context, (session) => userRepository.claimScheduledErasure(user.id, now, session));

/**
 * Every owner-scheduled account whose grace has run out: the purge job's list. The repository is
 * not published, so the job reads through here.
 *
 * @param now - the moment `purgeAt` is judged against
 */
export const findDueScheduledDeletions = (now: Date = new Date()): Promise<UserDocument[]> =>
    userRepository.findScheduledDeletionsDue(now);

/**
 * Erase an account again on a restored database, keeping the date it was first erased on. The
 * door `ops:reapply-erasures` uses: a restore brought the account back, the erasure ledger says
 * it was erased.
 *
 * @param userId - the account the ledger names
 * @param erasedAt - the original erasure date, so the clocks the erasure starts do not restart
 * @param context - the operator's system context
 * @returns `null` when the restored database does not hold the account (nothing to erase)
 */
export const eraseAgain = (
    userId: string,
    erasedAt: Date,
    context: CallerContext
): Promise<Awaited<ReturnType<typeof erase>> | null> =>
    userRepository
        .findById(userId)
        .then((user) => (user ? erase(user, context, undefined, erasedAt) : null));

/**
 * Put an account's owner-deletion lock back as the erasure ledger remembers it, on a restored
 * database: set it to the stored dates, or clear it. The door `ops:reapply-erasures` uses, since
 * {@link restoreOwnAccount} refuses once `purgeAt` has passed.
 *
 * @param userId - the account the ledger names
 * @param schedule - the stored dates the owner was promised, or `null` for "cancelled"
 * @returns `null` when the database does not hold the account; else whether it changed
 */
export const restoreDeletionState = (
    userId: string,
    schedule: { requestedAt: Date; purgeAt: Date } | null
): Promise<boolean | null> =>
    userRepository
        .findById(userId)
        .then((user) => (user ? userRepository.setOwnerDeletionState(userId, schedule) : null));
