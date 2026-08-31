/**
 * @module
 * The fake PSP — a provider that never talks to the outside world, but answers the way the real
 * ones do in their test modes, magic card numbers included: `4000000000000002` comes back
 * `declined`, anything else — including Stripe's conventional `4242424242424242` — `succeeded`.
 * That lets the demo (and every e2e) walk the decline path as honestly as the happy one. Refunds
 * always succeed: there is no outside ledger to disagree.
 */

import { logger } from '@infrastructure/adapters/logger';
import { cardLastFour } from './card';
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
export const fakePaymentProvider: PaymentProvider = {
    name: 'fake',

    charge: (charge, card) => {
        const outcome =
            card.cardNumber.replaceAll(/\s/g, '') === FAKE_DECLINE_CARD ? 'declined' : 'succeeded';
        logger.info(
            `[fake-psp] charge ${charge.amount} ${charge.currency} on card ****${cardLastFour(card.cardNumber)} → ${outcome}`
        );
        return Promise.resolve(outcome);
    },

    refund: (charge) => {
        logger.info(`[fake-psp] refund ${charge.amount} ${charge.currency} → succeeded`);
        return Promise.resolve();
    }
};
