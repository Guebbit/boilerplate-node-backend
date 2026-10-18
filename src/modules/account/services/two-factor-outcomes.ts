/**
 * @module
 * What the two-factor flows say back: the audited outcome, the refusals, the out-of-band notices
 * and a method's public summary. Internal — no flow of its own.
 */

import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { userService, type UserDocument } from '@modules/users';
import {
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { isLostRace } from '@infrastructure/persistence/versioning';
import type { CallerContext } from '@types';
import { recordAudit, type AuditAction } from '@infrastructure/observability/audit';
import type { TwoFactorDelivery, TwoFactorMethodSummary } from '@types';
import {
    twoFactorChangedEmail,
    twoFactorLockedEmail,
    recipientLocale,
    greetableName,
    type TwoFactorChange
} from '../emails';
import { sendAccountMail } from './mail';
import { resendTooSoon } from '../cooldown';
import { ERROR_CODES } from '@api/error-codes';
import {
    DELIVERED_CODE_RESEND_SECONDS,
    MFA_LOCK_MS,
    deliveryCooldownRemaining,
    orderedEntries,
    type TwoFactorMethodHandler
} from '../two-factor';

/**
 * The error code a client branches on to render a resend countdown rather than a generic 429.
 * Module-private like every other code in this app: a client reads it off the response, not off
 * an exported constant.
 */
const RESEND_TOO_SOON_CODE = ERROR_CODES.TWO_FACTOR_RESEND_TOO_SOON;

/**
 * Tell the account holder, out of band, that their second factors changed. Fire-and-forget: the
 * change already happened, and a queue that is briefly down must not turn it into an error.
 *
 * @param user - the account, carrying its address and locale
 * @param change - what happened
 * @param method - the factor concerned, for an add, replace or removal
 * @param context - the caller, whose locale is the fallback
 */
export const notifyChange = (
    user: UserDocument,
    change: TwoFactorChange,
    method: string,
    context: CallerContext
): void => {
    void sendAccountMail(
        user.email,
        twoFactorChangedEmail(
            recipientLocale(user.locale, context),
            greetableName(user, user.email),
            change,
            method
        ),
        'normal'
    ).catch((error: unknown) => {
        logger.warn({ message: 'Could not queue a two-factor change notice.', error });
    });
};

/**
 * Record one method-scoped 2FA action and pass the outcome through untouched. Both halves are
 * kept: a failed enrollment or disable is exactly what a stolen session looks like from here.
 */
export const audited = <T>(
    outcome: Promise<ResponseSuccess<T> | ResponseReject>,
    context: CallerContext,
    action: AuditAction,
    method: string
): Promise<ResponseSuccess<T> | ResponseReject> =>
    outcome.then((result) => {
        recordAudit(context, {
            action,
            outcome: result.success ? 'success' : 'failure',
            metadata: { method }
        });
        return result;
    });

/**
 * The rejection a wrong code earns, SAVED when it spent something: a miss can burn a delivered
 * code's attempt budget, and dropping that write is how an attempt ceiling silently becomes no
 * ceiling at all. A miss that changed nothing (a wrong or replayed TOTP) writes nothing, so a
 * burst of them cannot collide with each other or with the one right code among them.
 * A write that finds the account gone is logged, not failed: the per-account reservation, not
 * this write, is what bounds the guessing.
 */
export const rejectWrongCode = (user: UserDocument): Promise<ResponseReject> =>
    (user.isModified()
        ? userService.persistTwoFactorMethods(user).then(() => undefined)
        : Promise.resolve()
    )
        .catch((error: unknown) => {
            if (!isLostRace(error)) throw error;
            logger.warn({ message: 'A wrong-code write found the account already gone.', error });
        })
        .then(() => generateReject(422, [t('account.two-factor.wrong-code')]));

/** The lock's length in minutes, for the notice's copy. */
const MFA_LOCK_MINUTES = MFA_LOCK_MS / 60_000;

/**
 * The rejection a locked account earns: 429, before any code was compared. The lock is the same
 * brake a login's own budgets use, so a client already renders it.
 */
export const rejectLocked = (): ResponseReject =>
    generateReject(429, [t('account.two-factor.locked')]);

/**
 * Tell the account holder, out of band, that wrong codes just locked their 2FA checks. Fire-and-
 * forget, like {@link notifyChange}: the lock already holds.
 */
export const notifyLocked = (user: UserDocument, context: CallerContext): void => {
    void sendAccountMail(
        user.email,
        twoFactorLockedEmail(
            recipientLocale(user.locale, context),
            greetableName(user, user.email),
            MFA_LOCK_MINUTES
        ),
        'normal'
    ).catch((error: unknown) => {
        logger.warn({ message: 'Could not queue a two-factor lock notice.', error });
    });
};

/**
 * One method's public description — what a caller holding only a challenge is allowed to know.
 * Deliberately no `enrolledAt`: the login step is answered by someone who has proved a password
 * and nothing else, and when an account armed a factor is none of their business. `twoFactorStatus`
 * adds it for the authenticated owner.
 */
export const summarize = (
    handler: TwoFactorMethodHandler,
    user: UserDocument
): TwoFactorMethodSummary => {
    const target = handler.target(user);
    return {
        method: handler.name,
        delivers: handler.delivers,
        ...(target && { target }),
        ...(handler.delivers && { resendAfter: DELIVERED_CODE_RESEND_SECONDS })
    };
};

/** This flow's code and copy bound onto the shared builder, so both call sites stay one argument. */
export const tooSoon = (seconds: number): ResponseReject =>
    resendTooSoon(RESEND_TOO_SOON_CODE, t('account.two-factor.resend-too-soon'), seconds);

/** The account's armed factors, in the registry's own order rather than enrollment order. */
export const armedEntries = (user: UserDocument) =>
    orderedEntries(user.twoFactorMethods).filter(({ entry }) => entry.enrolledAt);

/**
 * Deliver a code for one ARMED, delivered method of `user` — the send both the login challenge's
 * and a signed-in caller's endpoint make, so their refusals and their cooldown cannot drift. The
 * caller finds the account (and answers its own 401); this does the rest.
 *
 * An unarmed method and an unknown one answer alike (422), so a wrong guess teaches nothing. An
 * armed method that was used a moment ago answers the cooldown instead, so the caller does learn
 * that one is armed. The cooldown is enforced here, not only by the route's limiter, since these
 * doors send mail on a caller's say-so.
 *
 * @param user - the account, loaded with its factors
 * @param method - the wire name of the method to deliver through
 * @param context - the caller; the mail needs its locale
 */
export const deliverArmedCode = (
    user: UserDocument,
    method: string,
    context: CallerContext
): Promise<ResponseSuccess<TwoFactorDelivery> | ResponseReject> => {
    const armed = armedEntries(user).find(({ handler }) => handler.name === method);
    if (!armed?.handler.send)
        return Promise.resolve(generateReject(422, [t('account.two-factor.not-delivered')]));

    const wait = deliveryCooldownRemaining(armed.entry);
    if (wait > 0) return Promise.resolve(tooSoon(wait));

    return armed.handler
        .send(user, armed.entry, context)
        .then((delivery) =>
            userService.persistTwoFactorMethods(user).then(() => generateSuccess(delivery))
        );
};
