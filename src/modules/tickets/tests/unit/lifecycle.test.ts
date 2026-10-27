/**
 * @module
 * The ticket lifecycle — `src/modules/tickets/domain/lifecycle.ts`. Pure: no mocks, no database.
 * Which status may go where, which stamps each move owes, and the dedup key.
 */

import { TicketStatus } from '@types';
import {
    initialTicketStatus,
    isOpen,
    markSpam,
    openKeyOf,
    reopen,
    resolve,
    type TicketFacts
} from '../../domain';

const NOW = new Date('2030-05-01T10:00:00Z');
const EARLIER = new Date('2030-04-01T10:00:00Z');

/** A ticket's facts, overridable. */
const facts = (overrides: Partial<TicketFacts> = {}): TicketFacts => ({
    status: TicketStatus.new,
    assigned: false,
    kind: 'contact',
    ...overrides
});

describe('initialTicketStatus — a fresh ticket starts by whether it looked like spam', () => {
    it.each([
        [true, TicketStatus.spam],
        [false, TicketStatus.new]
    ])('suspected spam %s starts as %s', (spam, expected) => {
        expect(initialTicketStatus(spam)).toBe(expected);
    });
});

describe('isOpen', () => {
    it.each([
        [TicketStatus.new, true],
        [TicketStatus.in_progress, true],
        [TicketStatus.resolved, false],
        [TicketStatus.spam, false]
    ])('%s is open: %s', (status, expected) => {
        expect(isOpen(status)).toBe(expected);
    });
});

describe('resolve', () => {
    it.each([TicketStatus.new, TicketStatus.in_progress, TicketStatus.spam])(
        'is allowed from %s and stamps closedAt, resolution and respondedAt',
        (status) => {
            const decision = resolve(facts({ status }), NOW);

            expect(decision).toEqual({
                patch: {
                    set: {
                        status: TicketStatus.resolved,
                        resolution: 'staff',
                        closedAt: NOW,
                        respondedAt: NOW
                    },
                    unset: ['openKey']
                }
            });
        }
    );

    it('keeps the earlier closedAt and respondedAt', () => {
        const decision = resolve(
            facts({ status: TicketStatus.spam, closedAt: EARLIER, respondedAt: EARLIER }),
            NOW
        );

        expect(decision).toMatchObject({
            patch: { set: { closedAt: EARLIER, respondedAt: EARLIER } }
        });
    });

    it('refuses a ticket that is already resolved', () => {
        expect(resolve(facts({ status: TicketStatus.resolved }), NOW)).toEqual({
            refusal: 'already_resolved'
        });
    });
});

describe('markSpam', () => {
    it.each([TicketStatus.new, TicketStatus.in_progress, TicketStatus.resolved])(
        'is allowed from %s, with no respondedAt',
        (status) => {
            const decision = markSpam(facts({ status }), NOW);

            expect(decision).toEqual({
                patch: {
                    set: { status: TicketStatus.spam, resolution: 'spam', closedAt: NOW },
                    unset: ['openKey']
                }
            });
        }
    );

    it('refuses a ticket that is already spam', () => {
        expect(markSpam(facts({ status: TicketStatus.spam }), NOW)).toEqual({
            refusal: 'already_spam'
        });
    });
});

describe('reopen', () => {
    it('goes to new without an assignee and to in_progress with one', () => {
        expect(reopen(facts({ status: TicketStatus.resolved }))).toMatchObject({
            patch: { set: { status: TicketStatus.new } }
        });
        expect(reopen(facts({ status: TicketStatus.spam, assigned: true }))).toMatchObject({
            patch: { set: { status: TicketStatus.in_progress } }
        });
    });

    it('clears closedAt and resolution, so the retention clock stops', () => {
        expect(reopen(facts({ status: TicketStatus.resolved }))).toMatchObject({
            patch: { unset: ['closedAt', 'resolution'] }
        });
    });

    it('restores the dedup key of a linked ticket and not of a visitor message', () => {
        const linked = reopen(
            facts({
                status: TicketStatus.resolved,
                kind: 'manual_refund_owed',
                link: { type: 'refund', id: 'r1' }
            })
        );

        expect(linked).toMatchObject({
            patch: { set: { openKey: 'manual_refund_owed:refund:r1' } }
        });
        expect(reopen(facts({ status: TicketStatus.resolved }))).not.toHaveProperty(
            'patch.set.openKey'
        );
    });

    it('refuses an open ticket', () => {
        expect(reopen(facts({ status: TicketStatus.in_progress }))).toEqual({
            refusal: 'already_open'
        });
    });
});

describe('openKeyOf', () => {
    it('is kind, link type and link id', () => {
        expect(openKeyOf('consent_due', { type: 'fulfillment_order', id: 'f9' })).toBe(
            'consent_due:fulfillment_order:f9'
        );
    });
});
