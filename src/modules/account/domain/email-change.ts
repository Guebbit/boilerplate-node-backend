/**
 * @module
 * The email-change flow as a table, with no I/O: which event applies in which state, and where it
 * leaves the account. The state is derived from two optional fields on the User document, never
 * stored, so the table is the one place that lists every edge.
 *
 * See: docs/modules/account.md#proving-an-address
 */

/** The four states the two fields spell out between them. */
export const EMAIL_CHANGE_STATES = ['idle', 'pending', 'changed', 'changedPending'] as const;

/**
 * Where an account stands in an email change.
 *
 * - `idle`:           no change pending, no previous address kept.
 * - `pending`:        a new address waits for its proof link.
 * - `changed`:        the swap happened; the old address is kept for the undo window.
 * - `changedPending`: a second change was requested during that window.
 */
export type EmailChangeState = (typeof EMAIL_CHANGE_STATES)[number];

/** Everything that can happen to an account's email change. */
export const EMAIL_CHANGE_EVENTS = [
    'request',
    'resend',
    'confirm',
    'cancel',
    'undo',
    'lapse'
] as const;

/**
 * One thing that happens to an email change.
 *
 * - `request`: a new address is asked for (`PUT`/`PATCH /account`).
 * - `resend`:  the proof link is mailed again.
 * - `confirm`: the proof link is spent; the pending address becomes the address.
 * - `cancel`:  the owner drops the pending address (`DELETE /account/pending-email`).
 * - `undo`:    the undo link is spent.
 * - `lapse`:   the undo window closes and the old address is forgotten.
 */
export type EmailChangeEvent = (typeof EMAIL_CHANGE_EVENTS)[number];

/** The fields the state is read from. */
export interface EmailChangeFields {
    /** The requested address not yet proven, if any. */
    pendingEmail?: string | null;

    /** The address held before the last confirmed change, if still kept. */
    previousEmail?: string | null;
}

/**
 * The state a `{ pendingEmail, previousEmail }` pair spells out.
 * @param fields - the two fields, as loaded with the credentials
 */
export const emailChangeStateOf = (fields: EmailChangeFields): EmailChangeState => {
    const pending = Boolean(fields.pendingEmail);
    const changed = Boolean(fields.previousEmail);
    if (pending) return changed ? 'changedPending' : 'pending';
    return changed ? 'changed' : 'idle';
};

/**
 * Where each event leaves each state. A missing entry means the event does not apply there: the
 * caller answers with a no-op, never an error, since each one is safe to repeat.
 */
const TRANSITIONS: Readonly<
    Record<EmailChangeState, Readonly<Partial<Record<EmailChangeEvent, EmailChangeState>>>>
> = {
    idle: { request: 'pending' },
    pending: {
        request: 'pending',
        resend: 'pending',
        confirm: 'changed',
        cancel: 'idle',
        undo: 'idle'
    },
    changed: { request: 'changedPending', undo: 'idle', lapse: 'idle' },
    changedPending: {
        request: 'changedPending',
        resend: 'changedPending',
        confirm: 'changed',
        cancel: 'changed',
        undo: 'changed',
        lapse: 'pending'
    }
};

/**
 * The state an event leaves an account in, or `undefined` when the event does not apply there.
 * @param state - the state the account is in now
 * @param event - what happens to it
 */
export const emailChangeNext = (
    state: EmailChangeState,
    event: EmailChangeEvent
): EmailChangeState | undefined => TRANSITIONS[state][event];

/**
 * Whether an undo link restores the old address, rather than cancelling a pending one. Only a
 * confirmed swap with nothing pending has an address to put back.
 * @param state - the state the account is in when the link is spent
 */
export const undoRestoresPreviousEmail = (state: EmailChangeState): boolean => state === 'changed';
