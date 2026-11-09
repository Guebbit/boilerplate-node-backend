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
            'deactivation',
            'deletion-scheduled',
            'email-change-undo',
            'password-change',
            'password-reset'
        ]);
    });

    it('has a caller that keeps its session ride the epoch in its own write', () => {
        const keepers = CAUSES.filter((cause) => REVOCATION[cause].callerKeeps);

        expect(keepers.filter((cause) => REVOCATION[cause].epoch !== 'with-write')).toEqual([]);
    });

    it('never tells a caller that keeps its session that it was compromised', () => {
        const keepers = CAUSES.filter((cause) => REVOCATION[cause].callerKeeps);

        expect(keepers.filter((cause) => REVOCATION[cause].announce)).toEqual([]);
    });

    it('limits one cause to a single session mode: refresh-token reuse, which only `jwt` has', () => {
        expect(CAUSES.filter((cause) => REVOCATION[cause].modes === 'jwt')).toEqual([
            'refresh-reuse'
        ]);
    });
});
