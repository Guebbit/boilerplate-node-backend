/**
 * @module
 * The legal deadline of a return's refund: Directive 2011/83/EU Art. 13(1) and (3) for a
 * withdrawal, Directive 2019/771 Art. 16(3)(b) for a faulty item, counted on the shop's calendar.
 */

import { withdrawalRefundDueBy } from '@modules/orders';
import { proofOpenedRefund, proofOpensRefund, refundDueByOf } from '../../domain';

/** The zone the refund deadline is read in. */
const ROME = 'Europe/Rome';

/** The day after `day`'s 14th, minus a millisecond, in Rome in winter (UTC+1). */
const END_OF_DAY_15_WINTER = new Date('2026-03-15T22:59:59.999Z');

describe('refundDueByOf', () => {
    const told = new Date('2026-03-01T10:00:00.000Z');
    const withdrawalDueBy = withdrawalRefundDueBy(told, ROME);

    it('is the end of day 15 for a withdrawal told on day 1 whose goods came on day 3', () => {
        expect(
            refundDueByOf({
                reason: 'withdrawal',
                withdrawalDueBy,
                receivedAt: new Date('2026-03-03T09:00:00.000Z')
            })
        ).toEqual({ dueBy: END_OF_DAY_15_WINTER, dueRule: 'withdrawal' });
    });

    it('is the moment the goods arrive when they come after that date', () => {
        const receivedAt = new Date('2026-03-20T09:00:00.000Z');
        expect(refundDueByOf({ reason: 'withdrawal', withdrawalDueBy, receivedAt })).toEqual({
            dueBy: receivedAt,
            dueRule: 'withdrawal'
        });
    });

    it('stays the end of day 15 when only a proof of sending came, on day 5', () => {
        expect(
            refundDueByOf({
                reason: 'withdrawal',
                withdrawalDueBy,
                proofOfSendingAt: new Date('2026-03-05T09:00:00.000Z')
            })
        ).toEqual({ dueBy: END_OF_DAY_15_WINTER, dueRule: 'withdrawal' });
    });

    it('counts the earlier of the proof and the goods against the date', () => {
        const proofOfSendingAt = new Date('2026-03-10T09:00:00.000Z');
        expect(
            refundDueByOf({
                reason: 'withdrawal',
                withdrawalDueBy,
                proofOfSendingAt,
                receivedAt: new Date('2026-03-25T09:00:00.000Z')
            })?.dueBy
        ).toEqual(END_OF_DAY_15_WINTER);
    });

    it('is due the moment the goods arrive for a faulty item', () => {
        const receivedAt = new Date('2026-03-04T09:00:00.000Z');
        expect(refundDueByOf({ reason: 'defective', receivedAt })).toEqual({
            dueBy: receivedAt,
            dueRule: 'faulty'
        });
    });

    it('is due the moment the proof of sending is dated for a wrong item, when it came before the goods', () => {
        const proofOfSendingAt = new Date('2026-03-04T09:00:00.000Z');
        expect(
            refundDueByOf({
                reason: 'wrong_item',
                proofOfSendingAt,
                receivedAt: new Date('2026-03-09T09:00:00.000Z')
            })
        ).toEqual({ dueBy: proofOfSendingAt, dueRule: 'faulty' });
    });

    it('has no date for a faulty item nothing has come back for', () => {
        expect(refundDueByOf({ reason: 'defective' })).toBeUndefined();
    });

    it('has no date for a goodwill return, whatever came back', () => {
        expect(
            refundDueByOf({
                reason: 'other',
                withdrawalDueBy,
                receivedAt: new Date('2026-03-04T09:00:00.000Z')
            })
        ).toBeUndefined();
    });

    it('is the withdrawal date alone while nothing has come back yet', () => {
        expect(refundDueByOf({ reason: 'withdrawal', withdrawalDueBy })).toEqual({
            dueBy: END_OF_DAY_15_WINTER,
            dueRule: 'withdrawal'
        });
    });
});

describe('proofOpensRefund', () => {
    it.each([
        ['withdrawal', true],
        ['defective', false],
        ['wrong_item', false],
        ['other', false]
    ] as const)('says %s: %s', (reason, opens) => {
        expect(proofOpensRefund(reason)).toBe(opens);
    });
});

describe('proofOpenedRefund', () => {
    const proofOfSendingAt = new Date('2026-03-02T09:00:00.000Z');

    it('holds for a withdrawal with a proof on it', () => {
        expect(proofOpenedRefund({ reason: 'withdrawal', proofOfSendingAt })).toBe(true);
    });

    it('does not hold for a withdrawal with no proof yet', () => {
        expect(proofOpenedRefund({ reason: 'withdrawal' })).toBe(false);
    });

    it('does not hold for a faulty item, whose proof only records', () => {
        expect(proofOpenedRefund({ reason: 'defective', proofOfSendingAt })).toBe(false);
    });
});
