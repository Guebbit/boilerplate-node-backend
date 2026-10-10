/**
 * @module
 * `markSessionsEnded`: the epoch moves on the loaded document, and never backwards.
 */

import { asStub } from '@tests/stub';
import { markSessionsEnded } from '../../services/credentials';
import type { UserDocument } from '../../model';

/** A holder with only the epoch set, which is all the function reads. */
const holder = (tokensValidAfter?: Date): UserDocument =>
    asStub<UserDocument>({ tokensValidAfter });

describe('markSessionsEnded', () => {
    it('sets the epoch on an account that has none', () => {
        const user = holder();
        const at = new Date('2026-01-02T00:00:00Z');

        markSessionsEnded(user, at);

        expect(user.tokensValidAfter).toEqual(at);
    });

    it('moves an older epoch forward', () => {
        const user = holder(new Date('2026-01-01T00:00:00Z'));
        const at = new Date('2026-01-02T00:00:00Z');

        markSessionsEnded(user, at);

        expect(user.tokensValidAfter).toEqual(at);
    });

    it('leaves a later epoch alone', () => {
        const later = new Date('2026-01-03T00:00:00Z');
        const user = holder(later);

        markSessionsEnded(user, new Date('2026-01-02T00:00:00Z'));

        expect(user.tokensValidAfter).toEqual(later);
    });
});
