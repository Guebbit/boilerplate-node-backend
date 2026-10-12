/**
 * @module
 * The email-change transition table: every (state, event) pair, so an edge added or dropped by
 * mistake fails here, and the state read from the two fields.
 */

import {
    EMAIL_CHANGE_EVENTS,
    EMAIL_CHANGE_STATES,
    emailChangeNext,
    emailChangeStateOf,
    undoRestoresPreviousEmail
} from '../../domain';
import type { EmailChangeEvent, EmailChangeState } from '../../domain';

/** Every edge that applies; any pair not listed must not apply. */
const EDGES: readonly (readonly [EmailChangeState, EmailChangeEvent, EmailChangeState])[] = [
    ['idle', 'request', 'pending'],
    ['pending', 'request', 'pending'],
    ['pending', 'resend', 'pending'],
    ['pending', 'confirm', 'changed'],
    ['pending', 'cancel', 'idle'],
    ['pending', 'undo', 'idle'],
    ['changed', 'request', 'changedPending'],
    ['changed', 'undo', 'idle'],
    ['changed', 'lapse', 'idle'],
    ['changedPending', 'request', 'changedPending'],
    ['changedPending', 'resend', 'changedPending'],
    ['changedPending', 'confirm', 'changed'],
    ['changedPending', 'cancel', 'changed'],
    ['changedPending', 'undo', 'changed'],
    ['changedPending', 'lapse', 'pending']
];

describe('emailChangeNext', () => {
    it.each(
        EMAIL_CHANGE_STATES.flatMap((state) =>
            EMAIL_CHANGE_EVENTS.map((event) => {
                const edge = EDGES.find(([from, on]) => from === state && on === event);
                return [state, event, edge?.[2]] as const;
            })
        )
    )('%s + %s leaves %s', (state, event, expected) => {
        expect(emailChangeNext(state, event)).toBe(expected);
    });
});

describe('emailChangeStateOf', () => {
    it.each([
        [{}, 'idle'],
        [{ pendingEmail: 'a@example.com' }, 'pending'],
        [{ previousEmail: 'b@example.com' }, 'changed'],
        [{ pendingEmail: 'a@example.com', previousEmail: 'b@example.com' }, 'changedPending'],
        [{ pendingEmail: null, previousEmail: null }, 'idle']
    ] as const)('reads %j as %s', (fields, expected) => {
        expect(emailChangeStateOf(fields)).toBe(expected);
    });
});

describe('undoRestoresPreviousEmail', () => {
    it('restores only from a confirmed swap with nothing pending', () => {
        expect(EMAIL_CHANGE_STATES.filter((state) => undoRestoresPreviousEmail(state))).toEqual([
            'changed'
        ]);
    });
});
