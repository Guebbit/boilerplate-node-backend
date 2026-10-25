/**
 * @module
 * `userActionsFor` as a pure table: caller role × account state → the flags. The same block over
 * real routes is the users contract suite; here every cell names the key or the state behind it.
 */

import { callerContextAs } from '@tests/callers';
import { userActionsFor, type ActionsSubject } from '../../services/actions';

/** A live, active account with no hold — the common row. */
const liveAccount: ActionsSubject = { id: 'owner' };

/** A hold that has not ended yet. */
const holdInForce = {
    until: new Date('2099-01-01T00:00:00Z'),
    reason: 'staff' as const,
    setAt: new Date('2026-01-01T00:00:00Z')
};

/** The caller of a given staff role, as `request.caller`. */
const callerOf = (role: string, id = 'caller') => callerContextAs(role, id).caller;

describe('userActionsFor — the keys', () => {
    it('gives a moderator every move a live customer allows, but not the role', () => {
        expect(userActionsFor(liveAccount, false, callerOf('moderator'))).toEqual({
            update: true,
            assignRole: false,
            delete: true,
            hardDelete: true,
            restore: false,
            setPurchaseHold: true,
            liftPurchaseHold: false,
            activate: false,
            deactivate: true
        });
    });

    it('gives support the edit alone: ban:User and delete:User are not its keys', () => {
        const actions = userActionsFor(liveAccount, false, callerOf('support'));

        expect(Object.entries(actions).filter(([, allowed]) => allowed)).toEqual([
            ['update', true]
        ]);
    });

    it('adds assignRole for a holder of assign:Role', () => {
        expect(userActionsFor(liveAccount, false, callerOf('admin')).assignRole).toBe(true);
    });

    it('does not refuse the role to the caller’s own account: no rule says so', () => {
        expect(userActionsFor({ id: 'me' }, true, callerOf('admin', 'me')).assignRole).toBe(true);
    });
});

describe('userActionsFor — the protection of staff accounts', () => {
    it('is all false for a staff account the caller cannot manage', () => {
        const actions = userActionsFor(liveAccount, true, callerOf('moderator'));

        expect(Object.values(actions).every((allowed) => !allowed)).toBe(true);
    });

    it('is judged by the keys alone on the caller’s own account', () => {
        expect(userActionsFor({ id: 'me' }, true, callerOf('moderator', 'me')).update).toBe(true);
    });
});

describe('userActionsFor — the account’s state', () => {
    it('offers restore on an owner-scheduled account only until its purgeAt', () => {
        const now = new Date('2026-06-15T00:00:00Z');
        const scheduled = (purgeAt: string): ActionsSubject => ({
            id: 'owner',
            deletedAt: new Date('2026-06-01T00:00:00Z'),
            purgeAt: new Date(purgeAt)
        });

        const inside = userActionsFor(
            scheduled('2026-06-20T00:00:00Z'),
            false,
            callerOf('moderator'),
            now
        );
        const past = userActionsFor(
            scheduled('2026-06-15T00:00:00Z'),
            false,
            callerOf('moderator'),
            now
        );

        expect(inside.restore).toBe(true);
        expect(past.restore).toBe(false);
    });

    it('offers restore and no soft delete on a deleted account, and still allows erasure', () => {
        const actions = userActionsFor(
            { id: 'owner', deletedAt: new Date() },
            false,
            callerOf('moderator')
        );

        expect(actions).toMatchObject({ delete: false, restore: true, hardDelete: true });
    });

    it('offers activate, not deactivate, on a deactivated account', () => {
        expect(
            userActionsFor({ id: 'owner', active: false }, false, callerOf('moderator'))
        ).toMatchObject({ activate: true, deactivate: false });
    });

    it('reads a missing `active` as active', () => {
        expect(userActionsFor(liveAccount, false, callerOf('moderator'))).toMatchObject({
            activate: false,
            deactivate: true
        });
    });

    it.each([
        ['a hold', { purchaseHold: holdInForce }],
        ['a review flag', { purchaseHoldFlaggedAt: new Date() }]
    ])('offers liftPurchaseHold when there is %s to clear', (_what, extra) => {
        expect(
            userActionsFor({ id: 'owner', ...extra }, false, callerOf('moderator')).liftPurchaseHold
        ).toBe(true);
    });

    it('still offers setPurchaseHold on an account that is held, to extend it', () => {
        expect(
            userActionsFor({ id: 'owner', purchaseHold: holdInForce }, false, callerOf('moderator'))
                .setPurchaseHold
        ).toBe(true);
    });
});
