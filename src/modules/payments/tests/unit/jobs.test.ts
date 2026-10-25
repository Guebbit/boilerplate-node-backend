/**
 * @module
 * The payment-effects sweep holds a lease: a hung provider call must not let a second pass resend
 * the same refund keys.
 */

import { paymentsJobs } from '../../jobs';

describe('the payment-effects sweep', () => {
    it('runs under a lease longer than its 5-minute interval', () => {
        const job = paymentsJobs.find(({ name }) => name === 'sweep:payment-effects');

        expect(job?.lease?.ttlMs).toBeGreaterThan(5 * 60_000);
    });
});
