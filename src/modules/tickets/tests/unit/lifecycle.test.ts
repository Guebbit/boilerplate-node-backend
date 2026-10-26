/**
 * @module
 * The ticket's status rules — `src/modules/tickets/domain/lifecycle.ts`. Pure: no mocks,
 * no database. The status set comes from the contract enum, never from a copy of it here.
 */

import { TicketStatus } from '@types';
import { initialTicketStatus, shouldStampRespondedAt } from '../../domain/lifecycle';

/** Every status in the contract enum, so a new one is covered without touching this file. */
const EVERY_STATUS = Object.values(TicketStatus);

describe('shouldStampRespondedAt — the first resolution only', () => {
    it.each([
        [TicketStatus.resolved, false, true],
        [TicketStatus.resolved, true, false],
        [TicketStatus.new, false, false],
        [TicketStatus.new, true, false],
        [TicketStatus.spam, false, false],
        [TicketStatus.spam, true, false]
    ])('for status %s and alreadyResponded=%s answers %s', (status, alreadyResponded, expected) => {
        expect(shouldStampRespondedAt(status, alreadyResponded)).toBe(expected);
    });

    it('stamps for no status other than resolved', () => {
        for (const status of EVERY_STATUS.filter((s) => s !== TicketStatus.resolved))
            expect(shouldStampRespondedAt(status, false)).toBe(false);
    });

    it('is false when the write leaves status untouched', () => {
        expect(shouldStampRespondedAt(undefined, false)).toBe(false);
        expect(shouldStampRespondedAt(undefined, true)).toBe(false);
    });
});

describe('initialTicketStatus — a fresh ticket starts by whether it looked like spam', () => {
    it('starts suspected spam at spam and everything else at new', () => {
        expect(initialTicketStatus(true)).toBe(TicketStatus.spam);
        expect(initialTicketStatus(false)).toBe(TicketStatus.new);
    });
});
