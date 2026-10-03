/**
 * @module
 * Address-book helpers for a sibling's tests that touch the database.
 */

import { addressAdd } from '../service';

/**
 * Gives an account one address-book entry, which becomes its default.
 *
 * Every checkout order carries a billing address, so a test that places an order for an account
 * with an empty book is refused with `CART_BILLING_ADDRESS_REQUIRED` — this is the one line that
 * keeps such a test about what it is about.
 *
 * @param userId - the account that keeps the entry
 * @returns once the entry is saved
 */
export const giveAddress = (userId: string): Promise<void> =>
    addressAdd(userId, {
        label: 'home',
        fullName: 'Ada Lovelace',
        street: 'Via Roma 1',
        city: 'Modena',
        zip: '41121',
        country: 'IT'
    }).then(() => undefined);
