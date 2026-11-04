/**
 * @module
 * What each shop situation opens — `src/modules/shop-tasks/domain/openings.ts`. Pure: no mocks,
 * no database. The consent reminder is the one with a table of its own (16 CFR 435.2), so it gets
 * every row, and the rule's reach follows the shop's country.
 */

import { PERMISSION_SETS } from '@kernel/permissions';
import { TaskKind, TaskLinkType } from '@types';
import { openKeyOf, type SystemOpening } from '@modules/tasks';
import {
    amountMismatchOpening,
    consentDueOpening,
    disputeOpening,
    FTC_JURISDICTIONS,
    paidWithoutHoldOpening,
    refundOwedOpening,
    refundRefusedOpening
} from '../../domain/openings';

const NOW = new Date('2030-05-01T10:00:00Z');
const DAY_MS = 86_400_000;
const AGREED = '2030-06-01T00:00:00.000Z';
const AGREED_PLUS_30 = new Date(new Date(AGREED).getTime() + 30 * DAY_MS);

/** A delay notice, overridable. */
const delay = (overrides = {}) => ({
    fulfillmentOrderId: 'fo1',
    orderId: 'o1',
    agreedAt: AGREED,
    promisedAt: AGREED,
    shipCountry: 'US',
    ...overrides
});

describe('consentDueOpening — a delay the buyer must be asked about', () => {
    it('opens, due agreed + 30 days, when no new date is given to a buyer holding the ordered date', () => {
        const opening = consentDueOpening(delay(), 'IT');
        expect(opening?.kind).toBe(TaskKind.consent_due);
        expect(opening?.routeSet).toBe('OrderEditing');
        expect(opening?.link).toEqual({ type: TaskLinkType.fulfillment_order, id: 'fo1' });
        expect(opening?.dueAt).toEqual(AGREED_PLUS_30);
    });

    it('opens when the new date is past agreed + 30 days', () => {
        const expectedAt = new Date(AGREED_PLUS_30.getTime() + DAY_MS).toISOString();
        expect(consentDueOpening(delay({ expectedAt }), 'IT')?.dueAt).toEqual(AGREED_PLUS_30);
    });

    it('does not open for a new date inside agreed + 30 days, the grace the law allows', () => {
        const expectedAt = AGREED_PLUS_30.toISOString();
        expect(consentDueOpening(delay({ expectedAt }), 'IT')).toBeUndefined();
    });

    it('measures a later slip against the date the buyer now holds, and is due on it', () => {
        const promisedAt = '2030-07-15T00:00:00.000Z';
        const inside = consentDueOpening(delay({ promisedAt, expectedAt: promisedAt }), 'IT');
        const later = consentDueOpening(
            delay({ promisedAt, expectedAt: '2030-07-16T00:00:00.000Z' }),
            'IT'
        );
        const none = consentDueOpening(delay({ promisedAt }), 'IT');
        expect(inside).toBeUndefined();
        expect(later?.dueAt).toEqual(new Date(promisedAt));
        expect(none?.dueAt).toEqual(new Date(promisedAt));
    });

    it('never opens for a buyer who was told there is no date yet: the earlier task stands', () => {
        expect(consentDueOpening(delay({ promisedAt: undefined }), 'IT')).toBeUndefined();
    });

    it.each(FTC_JURISDICTIONS)('opens for a shop in %s, whatever the destination', (country) => {
        expect(consentDueOpening(delay({ shipCountry: 'IT' }), country)).toBeDefined();
        expect(consentDueOpening(delay({ shipCountry: undefined }), country)).toBeDefined();
    });

    it.each(FTC_JURISDICTIONS)('opens for a shop elsewhere shipping to %s', (shipCountry) => {
        expect(consentDueOpening(delay({ shipCountry }), 'DE')).toBeDefined();
    });

    it.each([['DE'], [undefined]])(
        'never opens for a shop outside the rule shipping to %s',
        (shipCountry) => {
            expect(consentDueOpening(delay({ shipCountry }), 'IT')).toBeUndefined();
            expect(consentDueOpening(delay({ shipCountry }), undefined)).toBeUndefined();
        }
    );
});

describe('the other openings', () => {
    const all: [string, SystemOpening][] = [
        ['refund owed', refundOwedOpening({ refundId: 'r1', orderId: 'o1' }, NOW)],
        ['amount mismatch', amountMismatchOpening({ paymentId: 'p1', orderId: 'o1' }, NOW)],
        ['paid without hold', paidWithoutHoldOpening('o1', NOW)],
        [
            'refund refused',
            refundRefusedOpening({ refundId: 'r1', orderId: 'o1', failureReason: 'declined' }, NOW)
        ],
        [
            'dispute',
            disputeOpening(
                { paymentId: 'p1', orderId: 'o1', kind: 'chargeback', reason: 'fraudulent' },
                NOW
            )
        ]
    ];

    it.each(all)('%s names its kind, its record and a declared route set', (_name, opening) => {
        expect(Object.values(TaskKind)).toContain(opening.kind);
        expect(PERMISSION_SETS.map((set) => set.name)).toContain(opening.routeSet);
        expect(openKeyOf(opening.kind, opening.link)).toBe(
            `${opening.kind}:${opening.link.type}:${opening.link.id}`
        );
    });

    it('tells administrators alone about an amount mismatch: it is a question about the books', () => {
        expect(amountMismatchOpening({ paymentId: 'p1', orderId: 'o1' }, NOW).routeSet).toBe(
            'AuditDisplay'
        );
    });

    it('dates a dispute by the provider deadline, else the fallback', () => {
        const base = { paymentId: 'p1', orderId: 'o1', kind: 'inquiry', reason: 'general' };
        const evidenceDueBy = '2030-05-20T00:00:00.000Z';
        expect(disputeOpening({ ...base, evidenceDueBy }, NOW).dueAt).toEqual(
            new Date(evidenceDueBy)
        );
        expect(disputeOpening(base, NOW).dueAt).toEqual(NOW);
    });

    it('is about a record, not a person: none of them ties itself to an account', () => {
        for (const [, opening] of all) expect(opening.subjectId).toBeUndefined();
    });

    it('carries ids only, never an address or a name', () => {
        for (const [, opening] of all) expect(opening.message).not.toMatch(/@/);
    });
});
