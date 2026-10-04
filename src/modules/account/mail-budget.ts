/**
 * @module
 * The per-RECIPIENT mail budget: how many mails this app will send to one mailbox in a day,
 * whichever flow asks. Signup, password reset, email change and both resends can each be pointed at
 * a stranger's address; a budget on the caller (an address, an account) bounds the caller, never
 * the victim, and a `+tag` makes every attempt look like a new address.
 *
 * Key:     the canonical mailbox (`canonicalMailbox`: no `+tag`, no dots for Gmail), pseudonymised.
 * Window:  24 hours, `NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX` (10): a per-minute window lets a slow
 *          drip through.
 * Doors:   {@link mailRecipientLimiter} for a route whose body names the address (signup, reset),
 *          {@link chargeMailRecipient} for a service that chose the recipient itself.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */

import type { Request, RequestHandler } from 'express';
import type { RateLimitBudget } from '@types';
import {
    chargeBudget,
    readBodyField,
    refuseRateLimited,
    type BudgetCharge
} from '@infrastructure/http/middlewares/rate-limit';
import { canonicalMailbox } from '@infrastructure/persistence/normalize-email';
import { pseudonymise } from '@infrastructure/security/pseudonymise';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import { ERROR_CODES } from '@api/error-codes';

/** One day, the window of the recipient budget. */
const MAIL_RECIPIENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Mails per window to ONE canonical mailbox. Ten is a verification mail, a few resends and a reset
 * or two, with room to spare; it is far below what turns a victim's inbox into a weapon.
 */
export const MAIL_RECIPIENT_BUDGET: RateLimitBudget = {
    name: 'Mail to one mailbox',
    namespace: 'mail-recipient',
    environmentVariable: 'NODE_MAIL_RECIPIENT_RATE_LIMIT_MAX',
    defaultMax: 10,
    windowMs: MAIL_RECIPIENT_WINDOW_MS,
    keyedBy:
        'the recipient mailbox: lowercased, `+tag` dropped, dots dropped for Gmail, pseudonymised',
    bounds:
        'Mails to ONE mailbox from signup, reset, email change and both resends, over a day — ' +
        'bounds the VICTIM of a mail bomb, which a budget on the caller cannot.',
    audited: true
};

/**
 * Spend one mail against a recipient's budget.
 *
 * @param address - the mailbox about to be mailed, as stored or submitted
 * @returns whether the mail may be sent, and when the window resets
 */
export const chargeMailRecipient = (address: string): Promise<BudgetCharge> =>
    chargeBudget(MAIL_RECIPIENT_BUDGET, pseudonymise('rate-limit', canonicalMailbox(address)));

/**
 * The service-side door: spend one mail against `address`, and answer the 429 to return when the
 * mailbox budget is spent (`undefined` when it fits). For a service that picked the recipient
 * itself, such as the stored address of a resend or a requested new address, so no body names it.
 *
 * @param address - the mailbox about to be mailed
 * @returns the refusal to hand back, or `undefined` when the mail may be sent
 */
export const mailRecipientRefusal = (address: string): Promise<ResponseReject | undefined> =>
    chargeMailRecipient(address).then(({ allowed, retryAfterSeconds }) =>
        allowed
            ? undefined
            : generateReject(429, [
                  {
                      code: ERROR_CODES.RATE_LIMITED,
                      message: t('generic.error-rate-limited'),
                      details: { retryAfter: retryAfterSeconds }
                  }
              ])
    );

/**
 * The route-side door: charge the address the BODY names, answering 429 once the mailbox's budget
 * is spent. A body naming no address passes: nothing will be mailed, and validation answers it.
 *
 * Mounted after the human-challenge-free limiters of the route, before the controller — a refused
 * request never reaches the code that sends.
 *
 * @param request - the incoming request, its JSON body parsed
 * @param response - answered with the shared 429 envelope when the budget is spent
 * @param next - called when the mailbox has room (or none was named)
 */
export const mailRecipientLimiter: RequestHandler = (request: Request, response, next) => {
    const address = readBodyField(request, 'email');
    if (!address) {
        next();
        return;
    }

    return chargeMailRecipient(address).then(({ allowed, retryAfterSeconds }) => {
        if (allowed) {
            next();
            return;
        }
        response.setHeader('Retry-After', String(retryAfterSeconds));
        refuseRateLimited(MAIL_RECIPIENT_BUDGET.audited)(request, response);
    });
};
