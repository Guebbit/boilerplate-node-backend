/**
 * @module
 * What each situation opens — `src/modules/tasks/domain/system.ts`. Pure: no mocks, no database.
 * The consent reminder is the one with a table of its own (16 CFR 435.2), so it gets every row.
 */

import { TaskKind, TaskLinkType } from '@types';
import {
    accountReviewOpening,
    clear,
    consentDueOpening,
    disputeOpening,
    exportFailedOpening,
    openKeyOf,
    paidWithoutHoldOpening,
    refundOwedOpening,
    refundRefusedOpening,
    routeSetOf,
    TASK_KINDS,
    type SystemOpening
} from '../../domain';

const NOW = new Date('2030-05-01T10:00:00Z');
const DAY_MS = 86_400_000;
const AGREED = '2030-06-01T00:00:00.000Z';
const AGREED_PLUS_30 = new Date(new Date(AGREED).getTime() + 30 * DAY_MS);
const FTC = ['US', 'PR'];

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
        const opening = consentDueOpening(delay(), FTC);
        expect(opening?.kind).toBe(TaskKind.consent_due);
        expect(opening?.link).toEqual({ type: TaskLinkType.fulfillment_order, id: 'fo1' });
        expect(opening?.dueAt).toEqual(AGREED_PLUS_30);
    });

    it('opens when the new date is past agreed + 30 days', () => {
        const expectedAt = new Date(AGREED_PLUS_30.getTime() + DAY_MS).toISOString();
        expect(consentDueOpening(delay({ expectedAt }), FTC)?.dueAt).toEqual(AGREED_PLUS_30);
    });

    it('does not open for a new date inside agreed + 30 days, the grace the law allows', () => {
        const expectedAt = AGREED_PLUS_30.toISOString();
        expect(consentDueOpening(delay({ expectedAt }), FTC)).toBeUndefined();
    });

    it('measures a later slip against the date the buyer now holds, and is due on it', () => {
        const promisedAt = '2030-07-15T00:00:00.000Z';
        const inside = consentDueOpening(delay({ promisedAt, expectedAt: promisedAt }), FTC);
        const later = consentDueOpening(
            delay({ promisedAt, expectedAt: '2030-07-16T00:00:00.000Z' }),
            FTC
        );
        const none = consentDueOpening(delay({ promisedAt }), FTC);
        expect(inside).toBeUndefined();
        expect(later?.dueAt).toEqual(new Date(promisedAt));
        expect(none?.dueAt).toEqual(new Date(promisedAt));
    });

    it('never opens for a buyer who was told there is no date yet: the earlier task stands', () => {
        expect(consentDueOpening(delay({ promisedAt: undefined }), FTC)).toBeUndefined();
    });

    it.each([['DE'], [undefined]])(
        'never opens for ship-to %s: outside the rule',
        (shipCountry) => {
            expect(consentDueOpening(delay({ shipCountry }), FTC)).toBeUndefined();
        }
    );

    it('applies to a territory listed beside the mainland', () => {
        expect(consentDueOpening(delay({ shipCountry: 'PR' }), FTC)).toBeDefined();
    });
});

describe('the other openings', () => {
    const all: [string, SystemOpening][] = [
        ['account review', accountReviewOpening('u1', NOW)],
        ['refund owed', refundOwedOpening({ refundId: 'r1', orderId: 'o1' }, NOW)],
        ['paid without hold', paidWithoutHoldOpening('o1', NOW)],
        ['export failed', exportFailedOpening({ userId: 'u1', exportId: 'e1' }, NOW)],
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

    it.each(all)('%s names its kind, its record and a routed set', (_name, opening) => {
        expect(TASK_KINDS).toContain(opening.kind);
        expect(routeSetOf(opening.kind)).toBeTruthy();
        expect(openKeyOf(opening.kind, opening.link)).toBe(
            `${opening.kind}:${opening.link.type}:${opening.link.id}`
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

    it('ties the account-bound openings to their person, so export and erasure follow it', () => {
        expect(accountReviewOpening('u1', NOW).subjectId).toBe('u1');
        expect(exportFailedOpening({ userId: 'u1', exportId: 'e1' }, NOW).subjectId).toBe('u1');
        expect(paidWithoutHoldOpening('o1', NOW).subjectId).toBeUndefined();
    });

    it('carries ids only, never an address or a name', () => {
        for (const [, opening] of all) expect(opening.message).not.toMatch(/@/);
    });
});

describe('clear — the system closes what the situation no longer owes', () => {
    it('resolves as cleared, stamps closedAt and drops the dedup key', () => {
        expect(clear(NOW)).toEqual({
            set: { status: 'resolved', resolution: 'cleared', closedAt: NOW },
            unset: ['openKey']
        });
    });
});
