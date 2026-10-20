/**
 * @module
 * The preorder slip rules, pure: what a moved date asks of the buyer, when silence turns into a
 * cancel, and which dates the daily sweep still has to tell someone about. Every row is a row of the
 * table in `domain/preorder.ts`, against a fixed clock.
 */

import { dayInZone } from '@domain-primitives/time';
import { FulfillmentConsent } from '@types';
import {
    answerBy,
    expectedDateOf,
    hasWaitExpired,
    judgeMove,
    judgeSlip,
    latestAnswerBy,
    needsDueNotice,
    slippedDays
} from '../../domain';

const DAY = 86_400_000;
const AGREED = new Date('2026-12-01T00:00:00Z');

/** A date `days` after the agreed one. */
const afterAgreed = (days: number): Date => new Date(AGREED.getTime() + days * DAY);

describe('judgeSlip', () => {
    it.each([
        ['a first slip of a few days', 0, 5, 'notify'],
        // Literals, not the constant: 30 days is the FTC limit (16 CFR 435.2(b)(1)(ii)) less the
        // two-day margin, so the number is the legal fact the test pins.
        ['a first slip of exactly 28 days', 0, 28, 'notify'],
        ['a first slip of 29 days', 0, 29, 'ask'],
        ['a second slip, however small', 1, 3, 'ask'],
        ['a third slip', 2, 40, 'ask']
    ])('%s', (_name, slips, days, expected) => {
        const verdict = judgeSlip({
            agreedAt: AGREED,
            expectedAt: afterAgreed(slips === 0 ? 0 : days - 1),
            slips,
            next: afterAgreed(days)
        });

        expect(verdict.kind).toBe(expected);
    });

    it('counts the slip from the date PROMISED, not from the last one expected', () => {
        // Expected had already moved 20 days; 10 more is 30 past the promise, but the first slip
        // is the only one silence may stand for, and this is already a second.
        expect(
            judgeSlip({
                agreedAt: AGREED,
                expectedAt: afterAgreed(20),
                slips: 1,
                next: afterAgreed(30)
            }).kind
        ).toBe('ask');
    });

    it.each([
        ['earlier than expected', afterAgreed(5)],
        ['the same date', afterAgreed(10)]
    ])('asks nothing for a date %s', (_name, next) => {
        expect(
            judgeSlip({ agreedAt: AGREED, expectedAt: afterAgreed(10), slips: 0, next }).kind
        ).toBe('earlier');
    });

    it('asks, with no date to offer, when the date was cleared', () => {
        expect(
            judgeSlip({ agreedAt: AGREED, expectedAt: afterAgreed(0), slips: 0, next: undefined })
                .kind
        ).toBe('ask');
    });
});

describe('judgeSlip with no date expected', () => {
    it('says nothing when there was none and there is none', () => {
        expect(judgeSlip({ agreedAt: AGREED, slips: 1, next: undefined }).kind).toBe('earlier');
    });

    it('follows a new date quietly when there was none', () => {
        expect(judgeSlip({ agreedAt: AGREED, slips: 1, next: afterAgreed(90) }).kind).toBe(
            'earlier'
        );
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
    const waiting = { agreedAt: AGREED, expectedAt: AGREED, slips: 0 };

    it('has nothing to judge when nothing was promised', () => {
        expect(judgeMove({ slips: 0 }, afterAgreed(90))).toBeUndefined();
    });

    it.each([
        ['a short first slip', afterAgreed(5), 'notify'],
        ['a long slip', afterAgreed(60), 'ask'],
        ['a cleared date', undefined, 'ask']
    ])('judges %s', (_name, next, expected) => {
        expect(judgeMove(waiting, next)?.kind).toBe(expected);
    });

    it('says nothing for a date that was already cleared and is cleared again', () => {
        expect(judgeMove({ agreedAt: AGREED, slips: 1 }, undefined)?.kind).toBe('earlier');
    });
});

describe('answerBy', () => {
    // Literals throughout: every date is a legal fact. Silence cancels at the promised date + 30
    // days (16 CFR 435.2 (b)(1)(iii)) or, for a renewed question, at the date the buyer accepted
    // ((b)(2)(ii)); the repo keeps 2 days of margin, so the promised-date cap is A + 28.
    const agreedAt = new Date('2026-12-01T00:00:00Z');

    it.each([
        ['a first question two days before the promise', '2026-11-29T08:00:00Z', {}, '2026-12-29'],
        ['a late move ten days after the promise', '2026-12-11T08:00:00Z', {}, '2026-12-29'],
        ['a question forty days before the promise', '2026-10-22T08:00:00Z', {}, '2026-11-21'],
        [
            'a re-ask, which never extends the open window',
            '2026-12-20T08:00:00Z',
            {
                consent: FulfillmentConsent.awaiting,
                consentDeadline: new Date('2026-12-25T23:59:59.999Z')
            },
            '2026-12-25'
        ],
        [
            'a renewed question, which cancels at the date accepted',
            '2027-01-05T08:00:00Z',
            { consent: FulfillmentConsent.confirmed, expectedAt: new Date('2027-01-19T00:00:00Z') },
            '2027-01-19'
        ],
        [
            'a question with no date expected',
            '2026-12-11T08:00:00Z',
            { expectedAt: undefined, agreedAt: undefined },
            '2027-01-10'
        ]
    ])('%s', (_name, asked, facts, lastDay) => {
        const deadline = answerBy(
            new Date(asked),
            {
                agreedAt,
                expectedAt: new Date('2026-12-05T00:00:00Z'),
                ...facts
            },
            'UTC'
        );

        expect(deadline.toISOString()).toBe(`${lastDay}T23:59:59.999Z`);
    });

    it('is never a deadline that has already gone', () => {
        const asked = new Date('2027-02-10T08:00:00Z');

        expect(
            answerBy(
                asked,
                { agreedAt, expectedAt: new Date('2026-12-05T00:00:00Z') },
                'UTC'
            ).toISOString()
        ).toBe('2027-02-10T23:59:59.999Z');
    });

    // The deadline ends the day the mail prints, on the SHOP's calendar: the day it is printed on
    // is the last day the buyer may answer, whatever the zone.
    describe.each(['Europe/Rome', 'America/New_York', 'Asia/Kolkata', 'Pacific/Kiritimati', 'UTC'])(
        'in %s',
        (zone) => {
            it.each([
                ['an open 30-day window', '2026-12-11T08:00:00Z', {}],
                ['a window cut by the promised date plus 28 days', '2026-12-20T08:00:00Z', {}],
                [
                    'a renewed question cut by the date accepted',
                    '2027-01-05T08:00:00Z',
                    {
                        consent: FulfillmentConsent.confirmed,
                        expectedAt: new Date('2027-01-19T00:00:00Z')
                    }
                ]
            ])('ends on the day it prints, to the millisecond: %s', (_name, asked, facts) => {
                const deadline = answerBy(
                    new Date(asked),
                    { agreedAt, expectedAt: new Date('2026-12-05T00:00:00Z'), ...facts },
                    zone
                );

                // Still the last printed day at the deadline, the next day one millisecond later.
                expect(dayInZone(new Date(deadline.getTime() + 1), zone)).not.toBe(
                    dayInZone(deadline, zone)
                );
            });
        }
    );

    it('ends a day later east of Greenwich than the UTC day it used to end on', () => {
        // Asked at 08:00Z on 11 December with no cap: 30 days on is 10 January. Rome's day ends at
        // 22:59Z, an hour before the UTC day does, and prints January 10 (UTC would print 11).
        const deadline = answerBy(new Date('2026-12-11T08:00:00Z'), {}, 'Europe/Rome');

        expect(deadline.toISOString()).toBe('2027-01-10T22:59:59.999Z');
        expect(dayInZone(deadline, 'Europe/Rome')).toBe('2027-01-10');
    });

    it('lets a buyer in New York answer on the evening of the printed day', () => {
        // 08:00Z is 03:00 in New York; 30 days on closes at the end of 10 January there, 04:59Z on
        // the 11th, so the evening of the printed day is still inside the window.
        const deadline = answerBy(new Date('2026-12-11T08:00:00Z'), {}, 'America/New_York');

        expect(deadline.toISOString()).toBe('2027-01-11T04:59:59.999Z');
        expect(dayInZone(deadline, 'America/New_York')).toBe('2027-01-10');
    });

    it('counts the preview as at most 30 days, to the millisecond', () => {
        const asked = new Date('2026-12-10T08:00:00Z');

        expect(latestAnswerBy(asked).getTime() - asked.getTime()).toBe(30 * DAY);
    });
});

describe('needsDueNotice', () => {
    const now = new Date('2026-12-20T00:00:00Z');

    it.each([
        ['a date that passed and was never noticed', { expectedAt: afterAgreed(10) }, true],
        [
            'a date that passed after the last notice',
            { expectedAt: afterAgreed(10), lastNoticeAt: afterAgreed(2) },
            true
        ],
        [
            'a date that passed but was noticed since',
            { expectedAt: afterAgreed(10), lastNoticeAt: afterAgreed(12) },
            false
        ],
        ['a date still ahead', { expectedAt: afterAgreed(30) }, false],
        ['a date a day ahead, inside the two-day margin', { expectedAt: afterAgreed(20) }, true],
        ['a date exactly two days ahead', { expectedAt: afterAgreed(21) }, true],
        ['a date three days ahead, outside the margin', { expectedAt: afterAgreed(22) }, false],
        [
            'a date noticed before the margin opened',
            { expectedAt: afterAgreed(21), lastNoticeAt: afterAgreed(18.5) },
            true
        ],
        [
            'a date noticed after the margin opened',
            { expectedAt: afterAgreed(21), lastNoticeAt: afterAgreed(19.5) },
            false
        ],
        ['no expected date at all', {}, false],
        [
            'a buyer already being asked',
            { expectedAt: afterAgreed(10), consent: FulfillmentConsent.awaiting },
            false
        ],
        [
            'a buyer who said keep waiting, with the date passed again',
            { expectedAt: afterAgreed(10), consent: FulfillmentConsent.confirmed },
            true
        ],
        [
            'a renewed question, fourteen days before the date',
            { expectedAt: afterAgreed(33), consent: FulfillmentConsent.confirmed },
            true
        ],
        [
            'a renewed question, fifteen days before the date',
            { expectedAt: afterAgreed(34), consent: FulfillmentConsent.confirmed },
            false
        ],
        [
            'a first question still waits for two days before the date',
            { expectedAt: afterAgreed(33) },
            false
        ]
    ])('%s', (_name, facts, expected) => {
        expect(needsDueNotice(facts, now)).toBe(expected);
    });
});

describe('hasWaitExpired', () => {
    const now = new Date('2026-12-20T00:00:00Z');

    it.each([
        [
            'asked, and the deadline passed',
            { consent: FulfillmentConsent.awaiting, consentDeadline: afterAgreed(5) },
            true
        ],
        [
            'asked, and the deadline is still ahead',
            { consent: FulfillmentConsent.awaiting, consentDeadline: afterAgreed(30) },
            false
        ],
        [
            'already marked expired, whatever the deadline says',
            { consent: FulfillmentConsent.expired },
            true
        ],
        [
            'answered yes, whatever the old deadline was',
            { consent: FulfillmentConsent.confirmed, consentDeadline: afterAgreed(5) },
            false
        ],
        ['never asked', {}, false]
    ])('%s', (_name, facts, expected) => {
        expect(hasWaitExpired(facts, now)).toBe(expected);
    });
});

describe('slippedDays', () => {
    it('counts whole days between the promise and the expectation, never below zero', () => {
        expect(slippedDays(AGREED, afterAgreed(12))).toBe(12);
        expect(slippedDays(AGREED, afterAgreed(-3))).toBe(0);
    });
});
