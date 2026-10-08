/**
 * @module
 * The feedback ticket's status rules — `src/modules/feedback/domain/lifecycle.ts`. Pure: no mocks,
 * no database. The status set comes from the contract enum, never from a copy of it here.
 */

import { FeedbackRequestStatus } from '@types';
import {
    initialFeedbackStatus,
    shouldStampRespondedAt,
    toFeedbackStatus
} from '../../domain/lifecycle';

/** Every status in the contract enum, so a new one is covered without touching this file. */
const EVERY_STATUS = Object.values(FeedbackRequestStatus);

describe('toFeedbackStatus — a status string narrows onto the closed set', () => {
    it.each(EVERY_STATUS)('round-trips %s', (status) => {
        expect(toFeedbackStatus(status)).toBe(status);
    });

    it.each([undefined, '', 'archived', 'NEW', 'Resolved', 'constructor', '__proto__'])(
        'maps %p to undefined',
        (value) => {
            expect(toFeedbackStatus(value)).toBeUndefined();
        }
    );
});

describe('shouldStampRespondedAt — the first resolution only', () => {
    it.each([
        [FeedbackRequestStatus.resolved, false, true],
        [FeedbackRequestStatus.resolved, true, false],
        [FeedbackRequestStatus.new, false, false],
        [FeedbackRequestStatus.new, true, false],
        [FeedbackRequestStatus.spam, false, false],
        [FeedbackRequestStatus.spam, true, false]
    ])('for status %s and alreadyResponded=%s answers %s', (status, alreadyResponded, expected) => {
        expect(shouldStampRespondedAt(status, alreadyResponded)).toBe(expected);
    });

    it('stamps for no status other than resolved', () => {
        for (const status of EVERY_STATUS.filter((s) => s !== FeedbackRequestStatus.resolved))
            expect(shouldStampRespondedAt(status, false)).toBe(false);
    });

    it('is false when the write leaves status untouched', () => {
        expect(shouldStampRespondedAt(undefined, false)).toBe(false);
        expect(shouldStampRespondedAt(undefined, true)).toBe(false);
    });
});

describe('initialFeedbackStatus — a fresh ticket starts by whether it looked like spam', () => {
    it('starts suspected spam at spam and everything else at new', () => {
        expect(initialFeedbackStatus(true)).toBe(FeedbackRequestStatus.spam);
        expect(initialFeedbackStatus(false)).toBe(FeedbackRequestStatus.new);
    });
});
