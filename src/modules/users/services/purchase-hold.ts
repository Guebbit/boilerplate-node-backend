/**
 * @module
 * The purchase hold: a protective pause on checkout for one account, so a person steps in before a
 * bot or a loop does damage. Set by staff (`setPurchaseHold`) or by the shop itself after repeated
 * buyer cancellations (`takeAutomaticPurchaseHold`, called from `orders`, which owns the count).
 *
 * Reads are free of side effects; a hold is "in force" only while `until` is in the future, so an
 * expired one needs no sweep. It never blocks paying an existing order, cancelling, a withdrawal,
 * a return, or the account's own data rights: checkout is the only door that asks.
 *
 * See: docs/modules/users.md#purchase-hold
 */

import { t } from '@infrastructure/i18n';
import {
    fieldError,
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { accessService } from '@modules/access';
import type { CallerContext } from '@types';
import type { PurchaseHoldRecord, UserDocument } from '../model';
import { usersAuditActions } from '../audit';
import { userRepository } from '../repository';

/** What a checkout (or a banner) needs to know about a hold in force. */
export type ActivePurchaseHold = Pick<PurchaseHoldRecord, 'until' | 'reason' | 'note' | 'setAt'>;

/**
 * The hold in force at `now`, or `undefined`. Pure, so a caller holding the document needs no read.
 *
 * @param user - anything carrying the stored hold
 * @param now - the instant to judge against
 */
export const activeHoldOf = (
    user: Pick<UserDocument, 'purchaseHold'>,
    now: Date
): ActivePurchaseHold | undefined => {
    const hold = user.purchaseHold;
    if (!hold || hold.until.getTime() <= now.getTime()) return undefined;
    return { until: hold.until, reason: hold.reason, note: hold.note, setAt: hold.setAt };
};

/**
 * The instant cancellations stop counting toward a hold: whichever is later of the last hold being
 * set and the last staff lift. Cancellations at or before it were already answered, so they never
 * trigger a second hold.
 *
 * @param user - anything carrying the stored hold and reset mark
 */
export const countingSinceOf = (
    user: Pick<UserDocument, 'purchaseHold' | 'purchaseHoldResetAt'>
): Date | undefined => {
    const marks = [user.purchaseHold?.setAt, user.purchaseHoldResetAt].filter(
        (mark): mark is Date => mark !== undefined
    );
    return marks.length === 0
        ? undefined
        : new Date(Math.max(...marks.map((mark) => mark.getTime())));
};

/**
 * What a checkout asks of an account before it holds any stock: the hold in force, if any.
 *
 * @param userId - the buyer
 * @param now - the instant to judge against
 */
export const purchaseHoldOf = (
    userId: string,
    now = new Date()
): Promise<ActivePurchaseHold | undefined> =>
    userRepository.findById(userId).then((user) => (user ? activeHoldOf(user, now) : undefined));

/**
 * Where `orders` starts counting an account's cancellations from.
 *
 * @param userId - the buyer
 * @returns the mark, or `undefined` when nothing has ever reset the count
 */
export const purchaseHoldCountingSince = (userId: string): Promise<Date | undefined> =>
    userRepository.findById(userId).then((user) => (user ? countingSinceOf(user) : undefined));

/**
 * Put a manual hold on an account, replacing any hold it has. The note is written for the buyer to
 * read (GDPR Art. 22(3): the reason, and a way to contest it).
 *
 * @param id - the account
 * @param input - the end date (must be in the future) and an optional note for the buyer
 * @param context - the staff caller: audited, and judged against the account like any ban
 * @returns the user; 404 when there is none, 403 `ROLE_MANAGEMENT_REQUIRED` for a staff account the
 *   caller may not manage, 422 on a past date
 */
export const setPurchaseHold = (
    id: string,
    input: { until: Date; note?: string },
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);

        return accessService.roleProtectedRefusal(context, id).then((refusal) => {
            if (refusal) return refusal;

            const now = new Date();
            if (input.until.getTime() <= now.getTime())
                return generateReject(422, [
                    fieldError('until', t('users.purchase-hold-until-past'))
                ]);

            const note = input.note?.trim();
            user.purchaseHold = {
                until: input.until,
                reason: 'staff',
                ...(note ? { note } : {}),
                setBy: context.caller.id ?? undefined,
                setAt: now
            };
            return userRepository.save(user).then((saved) => {
                recordAudit(context, {
                    action: usersAuditActions.ADMIN_USER_PURCHASE_HOLD_SET,
                    outcome: 'success',
                    targetType: 'user',
                    targetId: id,
                    metadata: { until: input.until.toISOString() }
                });
                return generateSuccess(saved, 200, t('users.purchase-hold-set'));
            });
        });
    });

/**
 * End a hold now and restart the count of cancellations from this moment: a staff review is exactly
 * this call. Safe to repeat. The audit row is written only when a hold was in force.
 *
 * @param id - the account
 * @param context - the staff caller
 * @returns the user; 404 when there is none, 403 `ROLE_MANAGEMENT_REQUIRED` for a staff account the
 *   caller may not manage
 */
export const liftPurchaseHold = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);

        return accessService.roleProtectedRefusal(context, id).then((refusal) => {
            if (refusal) return refusal;

            const now = new Date();
            const wasInForce = activeHoldOf(user, now) !== undefined;
            user.purchaseHold = undefined;
            user.purchaseHoldResetAt = now;
            return userRepository.save(user).then((saved) => {
                if (wasInForce)
                    recordAudit(context, {
                        action: usersAuditActions.ADMIN_USER_PURCHASE_HOLD_LIFTED,
                        outcome: 'success',
                        targetType: 'user',
                        targetId: id
                    });
                return generateSuccess(saved, 200, t('users.purchase-hold-lifted'));
            });
        });
    });

/**
 * Take the automatic hold after repeated cancellations. Atomic: when two cancellations race to the
 * limit only one call returns `true`, so only one staff mail and one audit row follow.
 *
 * @param id - the account
 * @param until - when the counted cancellations fall back under the limit
 * @param context - the system caller, for the audit row
 * @returns whether this call took the hold
 */
export const takeAutomaticPurchaseHold = (
    id: string,
    until: Date,
    context: CallerContext
): Promise<boolean> => {
    const now = new Date();
    return userRepository
        .claimPurchaseHold(id, { until, reason: 'repeated_cancellations', setAt: now }, now)
        .then((taken) => {
            if (taken)
                recordAudit(context, {
                    action: usersAuditActions.SYSTEM_USER_PURCHASE_HOLD_SET,
                    outcome: 'success',
                    targetType: 'user',
                    targetId: id,
                    metadata: { until: until.toISOString() }
                });
            return taken;
        });
};
