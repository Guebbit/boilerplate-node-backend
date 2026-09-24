/**
 * `src/modules/feedback/rate-limits.ts` — what is worth pinning about the contact-form budgets is
 * the relationship between their numbers: a contact request filed once by a person must not share
 * a bucket with ordinary browsing, and the address-block budget must sit above the address budget
 * it widens.
 *
 * The behavioural property — spent by success, keyed on identity/address/block — sends a real
 * request through `express-rate-limit`'s middleware, which `no-restricted-imports` treats as an
 * integration concern: see `../integration/contact-identity-rate-limit.test.ts` and
 * `../integration/submission-rate-limit.test.ts`.
 */
import { DEFAULT_RATE_LIMIT_MAX } from '@infrastructure/http/middlewares/rate-limit';
import { feedbackRateLimits } from '@modules/feedback/rate-limits';
import { budgetIn } from '@tests/rate-limit-budgets';

/** One of this module's own declared budgets, by its `namespace`. */
const budget = (namespace: string) => budgetIn(feedbackRateLimits, namespace);

describe('contactLimiters', () => {
    it('keeps every dimension a small fraction of the browsing budget', () => {
        // Same reasoning as the credential budget: a contact form filed once by a person must not
        // share a bucket with ordinary browsing.
        expect(budget('submissions').defaultMax).toBeLessThan(DEFAULT_RATE_LIMIT_MAX / 5);
        expect(budget('submission-identity').defaultMax).toBeLessThan(DEFAULT_RATE_LIMIT_MAX / 5);
    });

    it('sizes the address-block budget above its own address budget', () => {
        expect(budget('submission-block').defaultMax).toBeGreaterThan(
            budget('submissions').defaultMax
        );
    });
});
