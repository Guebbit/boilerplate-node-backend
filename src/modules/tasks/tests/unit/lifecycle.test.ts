/**
 * @module
 * The task lifecycle — `src/modules/tasks/domain/lifecycle.ts`. Pure: no mocks, no database.
 * Which status may go where, which stamps each move owes, and the dedup key.
 */

import { TaskStatus } from '@types';
import {
    initialTaskStatus,
    isOpen,
    markSpam,
    openKeyOf,
    reopen,
    resolve,
    type TaskFacts
} from '../../domain';

const NOW = new Date('2030-05-01T10:00:00Z');
const EARLIER = new Date('2030-04-01T10:00:00Z');

/** A task's facts, overridable. */
const facts = (overrides: Partial<TaskFacts> = {}): TaskFacts => ({
    status: TaskStatus.new,
    assigned: false,
    kind: 'contact',
    ...overrides
});

describe('initialTaskStatus — a fresh task starts by whether it looked like spam', () => {
    it.each([
        [true, TaskStatus.spam],
        [false, TaskStatus.new]
    ])('suspected spam %s starts as %s', (spam, expected) => {
        expect(initialTaskStatus(spam)).toBe(expected);
    });
});

describe('isOpen', () => {
    it.each([
        [TaskStatus.new, true],
        [TaskStatus.in_progress, true],
        [TaskStatus.resolved, false],
        [TaskStatus.spam, false]
    ])('%s is open: %s', (status, expected) => {
        expect(isOpen(status)).toBe(expected);
    });
});

describe('resolve', () => {
    it.each([TaskStatus.new, TaskStatus.in_progress, TaskStatus.spam])(
        'is allowed from %s and stamps closedAt, resolution and respondedAt',
        (status) => {
            const decision = resolve(facts({ status }), NOW);

            expect(decision).toEqual({
                patch: {
                    set: {
                        status: TaskStatus.resolved,
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
            facts({ status: TaskStatus.spam, closedAt: EARLIER, respondedAt: EARLIER }),
            NOW
        );

        expect(decision).toMatchObject({
            patch: { set: { closedAt: EARLIER, respondedAt: EARLIER } }
        });
    });

    it('refuses a task that is already resolved', () => {
        expect(resolve(facts({ status: TaskStatus.resolved }), NOW)).toEqual({
            refusal: 'already_resolved'
        });
    });
});

describe('markSpam', () => {
    it.each([TaskStatus.new, TaskStatus.in_progress, TaskStatus.resolved])(
        'is allowed from %s, with no respondedAt',
        (status) => {
            const decision = markSpam(facts({ status }), NOW);

            expect(decision).toEqual({
                patch: {
                    set: { status: TaskStatus.spam, resolution: 'spam', closedAt: NOW },
                    unset: ['openKey']
                }
            });
        }
    );

    it('refuses a task that is already spam', () => {
        expect(markSpam(facts({ status: TaskStatus.spam }), NOW)).toEqual({
            refusal: 'already_spam'
        });
    });
});

describe('reopen', () => {
    it('goes to new without an assignee and to in_progress with one', () => {
        expect(reopen(facts({ status: TaskStatus.resolved }))).toMatchObject({
            patch: { set: { status: TaskStatus.new } }
        });
        expect(reopen(facts({ status: TaskStatus.spam, assigned: true }))).toMatchObject({
            patch: { set: { status: TaskStatus.in_progress } }
        });
    });

    it('clears closedAt and resolution, so the retention clock stops', () => {
        expect(reopen(facts({ status: TaskStatus.resolved }))).toMatchObject({
            patch: { unset: ['closedAt', 'resolution'] }
        });
    });

    it('restores the dedup key of a linked task and not of a visitor message', () => {
        const linked = reopen(
            facts({
                status: TaskStatus.resolved,
                kind: 'export_failed',
                link: { type: 'export', id: 'e1' }
            })
        );

        expect(linked).toMatchObject({
            patch: { set: { openKey: 'export_failed:export:e1' } }
        });
        expect(reopen(facts({ status: TaskStatus.resolved }))).not.toHaveProperty(
            'patch.set.openKey'
        );
    });

    it('refuses an open task', () => {
        expect(reopen(facts({ status: TaskStatus.in_progress }))).toEqual({
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
