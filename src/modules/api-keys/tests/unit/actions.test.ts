/**
 * @module
 * `services/actions.ts` — what a caller may do to a credential. The one move is revoking: it
 * needs the `delete:ApiKey` key, and a credential that is already revoked has nothing left to
 * revoke.
 */

import { callerContextAs } from '@tests/callers';
import { actionsForRows } from '../../services/actions';

describe('actionsForRows', () => {
    it('offers an administrator the revoke of a live credential', () => {
        const actionsFor = actionsForRows(callerContextAs('admin'));

        expect(actionsFor({})).toEqual({ revoke: true });
    });

    it('withdraws the revoke once the credential is revoked', () => {
        const actionsFor = actionsForRows(callerContextAs('admin'));

        expect(actionsFor({ revokedAt: new Date().toISOString() })).toEqual({ revoke: false });
    });

    it('offers a caller without the key nothing', () => {
        const actionsFor = actionsForRows(callerContextAs('customer'));

        expect(actionsFor({})).toEqual({ revoke: false });
    });
});
