/**
 * @module
 * The preorder slip rules, pure: what a moved date owes the buyer, and which dates the daily sweep
 * still has to tell someone about. The shop only tells: no row here asks the buyer anything or
 * cancels. Every row is a row of the table in `domain/preorder.ts`, against a fixed clock.
 */

import { expectedDateOf, judgeMove, judgeSlip, needsDueNotice, slippedDays } from '../../domain';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const AGREED = new Date('2026-12-01T00:00:00Z');

/** A date `days` after the agreed one. */
const afterAgreed = (days: number): Date => new Date(AGREED.getTime() + days * DAY);

describe('judgeSlip', () => {
    it.each([
        ['a slip of a few days', 5],
        // However long the slip is, the shop tells and the buyer decides: there is no length at
        // which silence starts to mean anything else.
        ['a slip of 29 days', 29],
        ['a slip of a year', 365]
    ])('tells the buyer about %s', (_name, days) => {
        expect(judgeSlip({ expectedAt: afterAgreed(0), next: afterAgreed(days) }).kind).toBe(
            'notify'
        );
    });

    it.each([
        ['earlier than expected', afterAgreed(5)],
        ['the same date', afterAgreed(10)]
    ])('says nothing for a date %s', (_name, next) => {
        expect(judgeSlip({ expectedAt: afterAgreed(10), next }).kind).toBe('earlier');
    });

    it('tells the buyer when the date was cleared', () => {
        expect(judgeSlip({ expectedAt: afterAgreed(0), next: undefined }).kind).toBe('notify');
    });

    it('says nothing when there was no date and there is none', () => {
        expect(judgeSlip({ next: undefined }).kind).toBe('earlier');
    });

    it('follows a new date quietly when there was none', () => {
        expect(judgeSlip({ next: afterAgreed(90) }).kind).toBe('earlier');
    });
});

/** A line of `quantity` units of product `productId`, with `shipped` already gone. */
const line = (productId: string, quantity = 1, shipped = 0) => ({
    productId,
    title: productId,
    quantity,
    shippedQuantity: shipped,
    cancelledQuantity: 0
});

describe('expectedDateOf', () => {
    const dates: Record<string, Date | undefined> = {
        a: afterAgreed(10),
        b: afterAgreed(20),
        none: undefined
    };
    const releaseDateOf = (id: string) => dates[id];

    it('is the latest release date among the lines', () => {
        expect(expectedDateOf([line('a'), line('b')], releaseDateOf)).toEqual(afterAgreed(20));
    });

    it('ignores a line with nothing left, whatever its date', () => {
        expect(expectedDateOf([line('a'), line('none', 1, 1)], releaseDateOf)).toEqual(
            afterAgreed(10)
        );
    });

    it('has no date when any line still waiting has none', () => {
        expect(expectedDateOf([line('a'), line('none')], releaseDateOf)).toBeUndefined();
    });

    it('has no date when nothing is left to wait for', () => {
        expect(expectedDateOf([line('a', 1, 1)], releaseDateOf)).toBeUndefined();
    });
});

describe('judgeMove', () => {
    const waiting = { agreedAt: AGREED, expectedAt: AGREED };

    it('has nothing to judge when nothing was promised', () => {
        expect(judgeMove({}, afterAgreed(90))).toBeUndefined();
    });

    it.each([
        ['a short slip', afterAgreed(5), 'notify'],
        ['a long slip', afterAgreed(60), 'notify'],
        ['a cleared date', undefined, 'notify']
    ])('judges %s', (_name, next, expected) => {
        expect(judgeMove(waiting, next)?.kind).toBe(expected);
    });

    it('says nothing for a date that was already cleared and is cleared again', () => {
        expect(judgeMove({ agreedAt: AGREED }, undefined)?.kind).toBe('earlier');
    });
});

describe('needsDueNotice', () => {
    const now = new Date('2026-12-20T00:00:00Z');

    it.each([
        ['a date that passed and was never noticed', { expectedAt: afterAgreed(10) }, true],
        ['a date exactly now', { expectedAt: now }, true],
        // The sweep looks one day ahead, so the buyer hears before the date is missed.
        ['a date 23 hours ahead', { expectedAt: new Date(now.getTime() + 23 * HOUR) }, true],
        ['a date 25 hours ahead', { expectedAt: new Date(now.getTime() + 25 * HOUR) }, false],
        ['a date still far ahead', { expectedAt: afterAgreed(30) }, false],
        [
            'a date already told about',
            { expectedAt: afterAgreed(10), dueNoticeFor: afterAgreed(10) },
            false
        ],
        [
            'a date moved later than the one told about',
            { expectedAt: afterAgreed(15), dueNoticeFor: afterAgreed(10) },
            true
        ],
        ['no expected date at all', {}, false]
    ])('%s', (_name, facts, expected) => {
        expect(needsDueNotice(facts, now)).toBe(expected);
    });
});

describe('slippedDays', () => {
    it('counts whole days between the promise and the expectation, never below zero', () => {
        expect(slippedDays(AGREED, afterAgreed(12))).toBe(12);
        expect(slippedDays(AGREED, afterAgreed(-3))).toBe(0);
    });
});
