/**
 * @module
 * Invariants of the `REVOCATION` table that no single cause's test would notice breaking.
 */

import { REVOCATION, announces, type RevocationCause } from '../../domain/revocation';

/** Every cause in the table. */
const CAUSES = Object.keys(REVOCATION) as RevocationCause[];

describe('the revocation table', () => {
    it('announces exactly the causes a subscriber must treat as a compromise', () => {
        expect(CAUSES.filter(announces).toSorted()).toEqual([
            'email-change-undo',
            'logout-all',
            'password-reset'
        ]);
    });

    it('purges the pending one-time links and challenges for exactly the credential changes', () => {
        expect(CAUSES.filter((cause) => REVOCATION[cause].pending).toSorted()).toEqual([
            'email-change-undo',
            'password-change',
            'password-reset'
        ]);
    });

    it.each(CAUSES)(
        '%s: a caller that keeps its session rode the epoch in its own write',
        (cause) => {
            if (REVOCATION[cause].callerKeeps) expect(REVOCATION[cause].epoch).toBe('with-write');
        }
    );

    it.each(CAUSES)(
        '%s: a caller that keeps its session is never told it was compromised',
        (cause) => {
            if (REVOCATION[cause].callerKeeps) expect(REVOCATION[cause].announce).toBe(false);
        }
    );

    it('limits one cause to a single session mode: refresh-token reuse, which only `jwt` has', () => {
        expect(CAUSES.filter((cause) => REVOCATION[cause].modes === 'jwt')).toEqual([
            'refresh-reuse'
        ]);
    });
});
