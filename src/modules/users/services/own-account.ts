/**
 * @module
 * The doors `account` reaches the user record through for the four things it does that the admin
 * doors (`updateById`, `removeById`) cannot serve: the owner editing their own profile, the owner
 * erasing their own account, and the inactivity reaper's two deletes.
 *
 * Each door narrows the raw `update` / `remove` it wraps. Those two skip the ban check and the
 * staff protection the admin doors enforce, so they stay `@internal` and only these reach them.
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { CallerContext } from '@types';
import { accessService } from '@modules/access';
import type { UserDocument } from '../model';
import { update } from './update';
import { remove } from './remove';

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
 */
export const updateOwnProfile = (
    user: UserDocument,
    data: OwnProfileData,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => update(user, data, context);

/** Marks a {@link RedeemedOwner}. Never exported: the type is how a signature asks for the proof. */
declare const redeemedOwnership: unique symbol;

/**
 * An account whose owner has just proved they hold it, by spending the one-time deletion link. The
 * route that erases an account is anonymous, so this spent link is the only thing that says the
 * person asking is the person it belongs to; a signature that takes this type, and not a bare
 * document, makes a caller say so out loud.
 */
export type RedeemedOwner = UserDocument & { readonly [redeemedOwnership]: true };

/**
 * Vouch that the owner of `user` redeemed their deletion link in this request. Call it right after
 * the link is spent and nowhere else: it checks nothing, it only names what the caller is claiming,
 * so a test fixture and a reviewer can both see the claim.
 *
 * @param user - the account the spent link belonged to
 */
export const redeemedOwner = (user: UserDocument): RedeemedOwner =>
    // The brand exists only in the type system: the document is the same object at run time.
    user as RedeemedOwner;

/**
 * Hard-delete the caller's own account. The route is anonymous (a one-time emailed token proves
 * ownership), so no rank check can apply: a staff member erasing themselves is allowed.
 *
 * @param owner - the account, vouched for by its spent deletion link ({@link redeemedOwner})
 * @param context - who did this; absent when no request is behind it
 */
export const eraseOwnAccount = (
    owner: RedeemedOwner,
    context?: CallerContext
): ReturnType<typeof remove> => remove(owner, true, context);

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
        return Promise.resolve(generateReject(409, [t('users.not-warned')]));

    return accessService
        .holdsStaffRole(String(user._id))
        .then((staff) =>
            staff
                ? generateReject(409, [t('users.inactive-staff-account')])
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
        : Promise.resolve(generateReject(409, [t('users.not-reaper-deleted')]));
