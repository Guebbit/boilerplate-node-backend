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
    it('is true only when a ticket becomes resolved for the first time', () => {
        for (const status of EVERY_STATUS)
            for (const alreadyResponded of [true, false])
                expect(shouldStampRespondedAt(status, alreadyResponded)).toBe(
                    status === FeedbackRequestStatus.resolved && !alreadyResponded
                );
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
