/**
 * `src/modules/account/rate-limits.ts` — what is worth pinning about the credential, signup,
 * reset, password-check and MFA budgets is the relationship between their numbers, not any one
 * value: a block budget below its own address budget defeats the point of adding it, and a
 * budget the size of the global brake stops doing the thing it was added for.
 *
 * The behavioural property — spent by success, keyed on identity/address/block, the MFA
 * challenge-less fallback — sends a real request through `express-rate-limit`'s middleware, which
 * `no-restricted-imports` treats as an integration concern: see
 * `../integration/identity-rate-limit.test.ts`.
 */
import { DEFAULT_RATE_LIMIT_MAX } from '@infrastructure/http/middlewares/rate-limit';
import { accountRateLimits } from '@modules/account/rate-limits';
import { budgetIn } from '@tests/rate-limit-budgets';

/** One of this module's own declared budgets, by its `namespace`. */
const budget = (namespace: string) => budgetIn(accountRateLimits, namespace);

describe('credentialLimiters', () => {
    it('keeps the identity budget a small fraction of the browsing budget', () => {
        // The point of a second limiter is that browsing traffic and password guesses do not
        // spend the same allowance. Raise the credential budget to the global one and the
        // module still works — it just stops doing the thing it was added for.
        expect(budget('credentials-identity').defaultMax).toBeLessThan(DEFAULT_RATE_LIMIT_MAX / 5);
    });

    /*
     * The Rung-1 property that matters is the ORDERING within the triple, not any one value:
     * identity ≤ address ≤ block, since a block is shared by many honest callers and a single
     * account or address is not. A block budget set below its own address budget would defeat
     * the point of adding it.
     */
    it('sizes each budget above the one before it: identity ≤ address ≤ block', () => {
        expect(budget('credentials-address').defaultMax).toBeGreaterThan(
            budget('credentials-identity').defaultMax
        );
        expect(budget('credentials-block').defaultMax).toBeGreaterThan(
            budget('credentials-address').defaultMax
        );
    });
});

describe('signupLimiters and resetRequestLimiters', () => {
    it('keep the identity budget a small fraction of the browsing budget', () => {
        expect(budget('signup-identity').defaultMax).toBeLessThan(DEFAULT_RATE_LIMIT_MAX / 5);
        expect(budget('reset-identity').defaultMax).toBeLessThan(DEFAULT_RATE_LIMIT_MAX / 5);
    });

    it('size each address-block budget above its own address budget', () => {
        expect(budget('signup-block').defaultMax).toBeGreaterThan(
            budget('signup-address').defaultMax
        );
        expect(budget('reset-block').defaultMax).toBeGreaterThan(
            budget('reset-address').defaultMax
        );
    });
});

describe('mfaChallengeLimiter and mfaSendLimiter', () => {
    it('bound guesses more tightly than deliveries — a guess is cheaper than a send', () => {
        expect(budget('mfa-challenge').defaultMax).toBeGreaterThan(budget('mfa-send').defaultMax);
    });

    it('window both on the challenge lifetime, not the shared browsing window', () => {
        expect(budget('mfa-challenge').windowMs).toBe(budget('mfa-send').windowMs);
        expect(budget('mfa-challenge').windowMs).not.toBe('shared');
    });
});
