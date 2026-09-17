/**
 * `src/modules/payments/rate-limits.ts` — what is worth pinning about the confirm-attempt and
 * confirm-decline budgets is the relationship between their numbers and their shared window, not
 * any one value: a decline is the rarer, costlier outcome an attempt is a superset of, and both
 * are windowed to the intent→confirm loop's own hour rather than the shared browsing window.
 *
 * The behavioural property — keyed on the authenticated account, `paymentDeclineChallengeGate`
 * triggering after a prior decline — sends a real request through `express-rate-limit`'s
 * middleware, which `no-restricted-imports` treats as an integration concern: see
 * `../integration/payment-velocity.test.ts`.
 */
import { paymentsRateLimits } from '@modules/payments/rate-limits';

/** One declared budget, by its `namespace` — throws loudly rather than reading `undefined`. */
const budget = (namespace: string) => {
    const found = paymentsRateLimits.find((each) => each.namespace === namespace);
    if (!found) throw new Error(`No payments rate-limit budget named "${namespace}"`);
    return found;
};

describe('paymentConfirmAttemptLimiter and paymentConfirmDeclineLimiter', () => {
    it('bounds declines more tightly than attempts — a decline is the rarer, costlier outcome', () => {
        expect(budget('payments-confirm-declines').defaultMax).toBeLessThan(
            budget('payments-confirm-attempts').defaultMax
        );
    });

    it('windows both off the shared browsing window, on the same hour', () => {
        expect(budget('payments-confirm-attempts').windowMs).not.toBe('shared');
        expect(budget('payments-confirm-attempts').windowMs).toBe(
            budget('payments-confirm-declines').windowMs
        );
    });

    it('spends the decline budget on a genuine decline only, unlike the attempt budget', () => {
        expect(budget('payments-confirm-declines').skipSuccessfulRequests).toBe(true);
        expect(budget('payments-confirm-attempts').skipSuccessfulRequests).not.toBe(true);
    });
});
