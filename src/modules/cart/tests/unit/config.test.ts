/**
 * @module
 * The cart's checkout caps: pure env reads, so the unit suite is enough. The 409 they produce is
 * proven over HTTP in the integration suite.
 */
import { maxOpenUnpaidOrdersPerAccount } from '../../config';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';

/** Every variable these cases drive, cleared before each one and put back after the file. */
const TOUCHED = ['NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT'] as const;

withoutEnvironmentInThisFile(TOUCHED);

describe('maxOpenUnpaidOrdersPerAccount', () => {
    it('defaults to 2, so a failed card can be retried while its hold runs out', () => {
        expect(maxOpenUnpaidOrdersPerAccount()).toBe(2);
    });

    it('reads NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT when set', () => {
        setEnvironment({ NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT: '5' });
        expect(maxOpenUnpaidOrdersPerAccount()).toBe(5);
    });

    // 0 would refuse every checkout: an account must be able to hold at least the order it places.
    it('refuses a ceiling below 1', () => {
        setEnvironment({ NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT: '0' });
        expect(() => maxOpenUnpaidOrdersPerAccount()).toThrow();
    });
});
