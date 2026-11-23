/**
 * @module
 * Who may spend a basket: the `checkout:Cart` rule rides the customer audience, so an address
 * that has not proven itself cannot start a checkout. The kernel's audience tests stay free of
 * it, since a deployment without a cart still has both audiences.
 */

import { callerAs } from '@tests/callers';

describe('the checkout rule', () => {
    it('lets only a proven address spend a basket', () => {
        expect(callerAs('customer').permissions).toContain('checkout:Cart');
        expect(callerAs('unverified').permissions).not.toContain('checkout:Cart');
    });
});
