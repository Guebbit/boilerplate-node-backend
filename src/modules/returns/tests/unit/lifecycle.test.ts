import { ReturnStatus } from '@types';
import { defineLifecycle } from '@domain-primitives/lifecycle';
import { RETURN_EVENTS, returnLifecycle } from '../../domain';

describe('returnLifecycle', () => {
    it('lets staff answer a request, and only a request', () => {
        expect(returnLifecycle.eventsFrom(ReturnStatus.requested)).toEqual(['approve', 'decline']);
    });

    it('lets an approved return be received or canceled', () => {
        expect(returnLifecycle.eventsFrom(ReturnStatus.approved)).toEqual(['receive', 'cancel']);
    });

    it('lets only a received return be closed', () => {
        expect(returnLifecycle.eventsFrom(ReturnStatus.received)).toEqual(['close']);
    });

    it('has no move out of a final status', () => {
        for (const status of [ReturnStatus.declined, ReturnStatus.canceled, ReturnStatus.closed])
            expect(returnLifecycle.eventsFrom(status)).toEqual([]);
    });

    it('lands each event where it says', () => {
        expect(returnLifecycle.toOf('approve')).toBe(ReturnStatus.approved);
        expect(returnLifecycle.toOf('decline')).toBe(ReturnStatus.declined);
        expect(returnLifecycle.toOf('receive')).toBe(ReturnStatus.received);
        expect(returnLifecycle.toOf('cancel')).toBe(ReturnStatus.canceled);
        expect(returnLifecycle.toOf('close')).toBe(ReturnStatus.closed);
    });

    it('starts a request at requested', () => {
        expect(returnLifecycle.initial).toBe(ReturnStatus.requested);
    });

    it('refuses to load when the table names a status the contract does not have', () => {
        const withoutClosed = Object.values(ReturnStatus).filter(
            (status) => status !== ReturnStatus.closed
        );

        expect(() =>
            defineLifecycle(withoutClosed, {
                initial: ReturnStatus.requested,
                events: RETURN_EVENTS
            })
        ).toThrow(/unknown "closed"/);
    });
});
