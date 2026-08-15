/**
 * The fake PSP — a provider that never talks to the outside world.
 *
 * It answers the way the real ones do in their test modes, magic card numbers included, so the
 * demo (and every e2e) can walk the decline path as honestly as the happy one:
 *
 * | card                  | outcome     |
 * |-----------------------|-------------|
 * | `4000000000000002`    | `declined`  |
 * | anything else         | `succeeded` |
 *
 * `4242424242424242` is the conventional success card (Stripe's), but any other number succeeds
 * too — a visitor typing digits into a demo should reach the happy path, and the decline stays
 * one specific, documented number away. Refunds always succeed: there is no outside ledger to
 * disagree.
 */

import { logger } from '@infrastructure/adapters/logger';
import type { PaymentProvider } from './index';

/** The one number that is refused — the same digits Stripe's test mode declines. */
export const FAKE_DECLINE_CARD = '4000000000000002';

/**
 * Every call is logged, and that is the point of a stub rather than noise.
 *
 * A real PSP leaves a trail somewhere you can go and read — a dashboard, a webhook log, a
 * statement. This one leaves nothing, so a demo that "took" money and an integration that quietly
 * never called the provider at all look identical from the outside. The log line is the fake's
 * substitute for that trail: it is how you tell "charged, succeeded" from "never reached".
 *
 * The card number is NEVER logged, only its last four digits — the same rule the payment document
 * follows. A stub is exactly where that discipline is easiest to drop and worst to learn late.
 */
const lastFour = (cardNumber: string): string => cardNumber.replaceAll(/\s/g, '').slice(-4);

export const fakePaymentProvider: PaymentProvider = {
    name: 'fake',

    charge: (charge, card) => {
        const outcome =
            card.cardNumber.replaceAll(/\s/g, '') === FAKE_DECLINE_CARD ? 'declined' : 'succeeded';
        logger.info(
            `[fake-psp] charge ${charge.amount} ${charge.currency} on card ****${lastFour(card.cardNumber)} → ${outcome}`
        );
        return Promise.resolve(outcome);
    },

    refund: (charge) => {
        logger.info(`[fake-psp] refund ${charge.amount} ${charge.currency} → succeeded`);
        return Promise.resolve();
    }
};
