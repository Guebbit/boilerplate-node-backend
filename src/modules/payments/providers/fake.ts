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

import type { IPaymentProvider } from './index';

/** The one number that is refused — the same digits Stripe's test mode declines. */
export const FAKE_DECLINE_CARD = '4000000000000002';

export const fakePaymentProvider: IPaymentProvider = {
    name: 'fake',

    charge: (_charge, card) =>
        Promise.resolve(
            card.cardNumber.replaceAll(/\s/g, '') === FAKE_DECLINE_CARD ? 'declined' : 'succeeded'
        ),

    refund: () => Promise.resolve()
};
