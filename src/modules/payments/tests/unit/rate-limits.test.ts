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
import {
    addressBlockOf,
    KEYED_BY_ADDRESS_BLOCK
} from '@infrastructure/http/middlewares/rate-limit';
import { budgetIn } from '@tests/rate-limit-budgets';

/** One of this module's own declared budgets, by its `namespace`. */
const budget = (namespace: string) => budgetIn(paymentsRateLimits, namespace);

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

    it('keys the block budget on the address block, looser than the account budget because a block is shared', () => {
        const block = budget('payments-confirm-declines-block');

        expect(block.keyedBy).toBe(KEYED_BY_ADDRESS_BLOCK);
        expect(block.keyGenerator).toBe(addressBlockOf);
        expect(block.defaultMax).toBeGreaterThan(budget('payments-confirm-declines').defaultMax);
        expect(block.environmentVariable).toBe('NODE_PAYMENT_DECLINE_BLOCK_RATE_LIMIT_MAX');
        expect(block.windowMs).toBe(budget('payments-confirm-declines').windowMs);
    });

    it('spends the block budget on a genuine decline only, under its own request property', () => {
        const block = budget('payments-confirm-declines-block');

        expect(block.skipSuccessfulRequests).toBe(true);
        expect(block.requestPropertyName).toBeDefined();
        expect(block.requestPropertyName).not.toBe(
            budget('payments-confirm-declines').requestPropertyName
        );
    });

    it('spends the decline budget on a genuine decline only, unlike the attempt budget', () => {
        expect(budget('payments-confirm-declines').skipSuccessfulRequests).toBe(true);
        expect(budget('payments-confirm-attempts').skipSuccessfulRequests).not.toBe(true);
    });
});
