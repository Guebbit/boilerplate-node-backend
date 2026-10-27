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

import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import {
    fieldError,
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { announceInTransaction } from '@kernel/outbox';
import { ERROR_CODES } from '@api/error-codes';
import { accessService } from '@modules/access';
import type { CallerContext } from '@types';
import type { PurchaseHoldRecord, UserDocument } from '../model';
import { usersAuditActions } from '../audit';
import { contactFrontendLink, privacyFrontendLink } from '../config';
import { purchaseHoldPlacedEmail } from '../emails';
import { USER_REVIEW_CLEARED, USER_REVIEW_FLAGGED } from '../events';
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
 * Whether lifting has anything to clear: a hold (in force, or ended and not yet swept) or a review
 * flag. The question behind `liftPurchaseHold`'s 409 and the `liftPurchaseHold` action flag.
 *
 * @param user - anything carrying the stored hold and review flag
 */
export const hasPurchaseHoldToClear = (
    user: Pick<UserDocument, 'purchaseHold' | 'purchaseHoldFlaggedAt'>
): boolean => user.purchaseHold !== undefined || user.purchaseHoldFlaggedAt !== undefined;

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

/** The rule behind an automatic hold, as the buyer's mail states it. */
export interface PurchaseHoldBasis {
    cancelCount: number;
    windowDays: number;
}

/**
 * Tell the buyer a hold was placed, in their own language: until when, why, what still works, a
 * way to ask a person, and their right to object. A mail that cannot be queued is logged, never
 * raised: the hold is already in force and the cart shows it.
 *
 * @param user - the account, for its address and language
 * @param hold - the hold just stored
 * @param basis - the rule's numbers, for an automatic hold
 */
const notifyBuyer = (
    user: Pick<UserDocument, 'email' | 'locale'>,
    hold: PurchaseHoldRecord,
    basis?: PurchaseHoldBasis
): void => {
    // Built inside the chain, so even a copy that throws is logged here and never reaches the
    // caller: by now the hold is stored.
    void Promise.resolve()
        .then(() => {
            // A stored locale wins; an account that never had one is written to in the deployment's.
            const locale = user.locale ?? getDefaultLocale();
            const mail = purchaseHoldPlacedEmail(locale, {
                until: hold.until,
                reason: hold.reason,
                ...basis,
                ...(hold.note === undefined ? {} : { note: hold.note }),
                contactUrl: contactFrontendLink(locale),
                privacyUrl: privacyFrontendLink(locale)
            });
            return enqueueEmail(
                { to: user.email, subject: mail.subject },
                mail.template,
                mail.data
            );
        })
        .catch((error: unknown) =>
            logger.error({ message: 'purchase hold buyer notification email failed', error })
        );
};

/**
 * Save the account after staff acted on it, and announce the review flag cleared in the same
 * transaction when it had one: the ticket that waits on the flag closes exactly when the flag does.
 *
 * @param user - the account, already changed in memory
 * @param wasFlagged - whether it carried the review flag before the change
 */
const saveAnnouncingReview = (user: UserDocument, wasFlagged: boolean): Promise<UserDocument> =>
    announceInTransaction(
        (session) => userRepository.save(user, session),
        (saved) =>
            wasFlagged
                ? {
                      name: USER_REVIEW_CLEARED,
                      payload: { userId: String(saved._id) },
                      aggregateId: String(saved._id)
                  }
                : []
    );

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
            const hold: PurchaseHoldRecord = {
                until: input.until,
                reason: 'staff',
                ...(note ? { note } : {}),
                setBy: context.caller.id ?? undefined,
                setAt: now
            };
            const wasFlagged = user.purchaseHoldFlaggedAt !== undefined;
            user.purchaseHold = hold;
            // Placing a hold is acting on a flagged account, so the flag has done its job.
            user.purchaseHoldFlaggedAt = undefined;
            return saveAnnouncingReview(user, wasFlagged).then((saved) => {
                notifyBuyer(saved, hold);
                recordAudit(context, {
                    action: usersAuditActions.ADMIN_USER_PURCHASE_HOLD_SET,
                    outcome: 'success',
                    targetType: 'user',
                    targetId: id,
                    metadata: { until: input.until.toISOString() }
                });
                return generateSuccess(saved, 200);
            });
        });
    });

/**
 * End a hold now, clear the review flag and restart the count of cancellations from this moment: a
 * staff review is exactly this call. Refused with 409 `USER_PURCHASE_HOLD_NOT_SET` when there is
 * neither a hold (in force, or already ended and not yet swept) nor a flag to clear. The audit row's
 * `inForce` metadata tells "lifted" from "reviewed, no hold in force".
 *
 * @param id - the account
 * @param context - the staff caller
 * @returns the user; 404 when there is none, 403 `ROLE_MANAGEMENT_REQUIRED` for a staff account the
 *   caller may not manage, 409 when there is nothing to lift
 */
export const liftPurchaseHold = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);

        return accessService.roleProtectedRefusal(context, id).then((refusal) => {
            if (refusal) return refusal;
            if (!hasPurchaseHoldToClear(user))
                return generateReject(409, [
                    {
                        code: ERROR_CODES.USER_PURCHASE_HOLD_NOT_SET,
                        message: t('users.purchase-hold-not-set')
                    }
                ]);

            const now = new Date();
            const wasInForce = activeHoldOf(user, now) !== undefined;
            const wasFlagged = user.purchaseHoldFlaggedAt !== undefined;
            user.purchaseHold = undefined;
            user.purchaseHoldFlaggedAt = undefined;
            user.purchaseHoldResetAt = now;
            return saveAnnouncingReview(user, wasFlagged).then((saved) => {
                recordAudit(context, {
                    action: usersAuditActions.ADMIN_USER_PURCHASE_HOLD_LIFTED,
                    outcome: 'success',
                    targetType: 'user',
                    targetId: id,
                    metadata: { inForce: wasInForce }
                });
                return generateSuccess(saved, 200);
            });
        });
    });

/**
 * The nightly sweep: reduce every expired hold to the mark that restarts the count, dropping its
 * note and the staff id. Safe to repeat. A hold in force is never touched.
 *
 * @param now - a hold ending at or before this instant is expired
 * @returns how many accounts were reduced
 */
export const reapExpiredPurchaseHolds = (now = new Date()): Promise<number> =>
    userRepository.reduceExpiredPurchaseHolds(now);

/**
 * Take the automatic hold after repeated cancellations. Atomic: when two cancellations race to the
 * limit only one call returns `true`, so only one staff mail and one audit row follow.
 *
 * @param id - the account
 * @param until - when the counted cancellations fall back under the limit
 * @param context - the system caller, for the audit row
 * @param basis - the rule's numbers, for the buyer's mail
 * @returns whether this call took the hold
 */
export const takeAutomaticPurchaseHold = (
    id: string,
    until: Date,
    context: CallerContext,
    basis: PurchaseHoldBasis
): Promise<boolean> => {
    const now = new Date();
    const hold: PurchaseHoldRecord = { until, reason: 'repeated_cancellations', setAt: now };
    return userRepository.claimPurchaseHold(id, hold, now).then((taken) => {
        if (!taken) return false;

        recordAudit(context, {
            action: usersAuditActions.SYSTEM_USER_PURCHASE_HOLD_SET,
            outcome: 'success',
            targetType: 'user',
            targetId: id,
            metadata: { until: until.toISOString() }
        });
        // Only the winner of a race reaches here, so the buyer is mailed once. A failed read of
        // the account costs the mail, never the hold.
        return userRepository
            .findById(id)
            .then((user) => {
                if (user) notifyBuyer(user, hold, basis);
            })
            .catch((error: unknown) =>
                logger.error({ message: 'purchase hold buyer notification failed', error })
            )
            .then(() => true);
    });
};

/**
 * Flag an account for staff review without pausing it: the answer to cancellations that must not
 * trigger a hold (paid ones are statutory withdrawals, a right the shop does not punish). Atomic:
 * when two cancellations race to the limit only one call returns `true`, so only one staff mail and
 * one audit row follow; an account already flagged returns `false` and is left as it is.
 *
 * @param id - the account
 * @param context - the system caller, for the audit row
 * @returns whether this call set the flag
 */
export const flagPurchaseHoldReview = (id: string, context: CallerContext): Promise<boolean> =>
    announceInTransaction(
        (session) =>
            userRepository
                .claimPurchaseHoldReview(id, new Date(), session)
                .then((flagged) => (flagged ? { id } : null)),
        ({ id: flaggedId }) => ({
            name: USER_REVIEW_FLAGGED,
            payload: { userId: flaggedId },
            aggregateId: flaggedId
        })
    ).then((written) => {
        const flagged = written !== null;
        if (flagged)
            recordAudit(context, {
                action: usersAuditActions.SYSTEM_USER_PURCHASE_HOLD_FLAGGED,
                outcome: 'success',
                targetType: 'user',
                targetId: id
            });
        return flagged;
    });
